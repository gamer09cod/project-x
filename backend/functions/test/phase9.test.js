'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { floorPvpWinPayout, floorPromoBoostCents } = require('../src/match/payout');
const { LEDGER_ENTRY_TYPE, BOOST_STATUS } = require('../src/domain');

const root = path.resolve(__dirname, '../../..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('floorPromoBoostCents', () => {
  it('uses integer math on the 2x stake pot', () => {
    const base = floorPvpWinPayout(19000, 0);
    assert.equal(base, 38000);
    assert.equal(floorPromoBoostCents(19000, 2500), 4750);
    assert.equal(floorPvpWinPayout(10000, 2500), 25000);
    assert.equal(floorPvpWinPayout(10000, 0) + floorPromoBoostCents(20000, 2500), 25000);
  });

  it('floors the fraction (house keeps dust)', () => {
    assert.equal(floorPromoBoostCents(333, 1500), 49);
    assert.equal(floorPromoBoostCents(0, 2500), 0);
    assert.equal(floorPromoBoostCents(1000, 0), 0);
  });

  it('does not use floating payout helpers', () => {
    const payout = read('backend/functions/src/match/payout.js');
    assert.doesNotMatch(payout, /\* 1\.\d+/);
    assert.match(payout, /Math\.floor\(\(base \* bps\) \/ 10000\)/);
  });
});

describe('boost consume / snapshot / settle sources', () => {
  const boosts = read('backend/functions/src/match/boosts.js');
  const join = read('backend/functions/src/match/join.js');
  const settle = read('backend/functions/src/match/settle.js');
  const crons = read('backend/functions/src/match/crons.js');
  const submit = read('backend/functions/src/match/submit.js');

  it('locks the inventory row and rejects reused / expired / foreign boosts', () => {
    assert.match(boosts, /FOR UPDATE/);
    assert.match(boosts, /boost_not_found/);
    assert.match(boosts, /boost_not_owned/);
    assert.match(boosts, /boost_already_consumed/);
    assert.match(boosts, /boost_expired/);
    assert.match(boosts, /boost_game_mismatch/);
    assert.match(boosts, /boost_mode_mismatch/);
    assert.match(boosts, /boost_wager_limit/);
    assert.match(boosts, /boost_budget_exceeded/);
    assert.match(boosts, /boost_player_limit/);
    assert.match(boosts, /AND status = \$4/);
    assert.equal(BOOST_STATUS.CONSUMED, 'consumed');
  });

  it('reserves promo with a concurrency-safe budget update', () => {
    assert.match(boosts, /reserved_cents \+ spent_cents \+ \$2 <= allocated_cents/);
    assert.match(boosts, /FOR UPDATE/);
    assert.match(boosts, /promo_player_periods/);
  });

  it('join snapshots boost terms onto match_players in the same flow as debit', () => {
    assert.match(join, /consumeBoostForJoin/);
    assert.match(join, /boost_bonus_bps/);
    assert.match(join, /boost_promo_reserved_cents/);
    assert.match(join, /WAGER_DEBIT/);
    assert.match(join, /percentageBps/);
  });

  it('settlement uses the snapshot, not live inventory, and splits PROMO_BOOST', () => {
    assert.match(settle, /winner\.boost_bonus_bps/);
    assert.doesNotMatch(settle, /SELECT bonus_bps FROM boosts/);
    assert.match(settle, /PROMO_BOOST/);
    assert.match(settle, /floorPromoBoostCents/);
    assert.match(settle, /spendPromoReservation/);
    assert.match(settle, /PAYOUT_CREDIT/);
    assert.match(submit, /boost_bonus_bps/);
    assert.doesNotMatch(submit, /SELECT bonus_bps FROM boosts/);
  });

  it('draw and no-opponent timeout restore inventory; paired loss does not', () => {
    assert.match(settle, /restoreInventory: true/);
    assert.match(settle, /restoreInventory: false/);
    assert.match(crons, /closeBoostReservation/);
    assert.match(crons, /restoreInventory: true/);
  });

  it('does not matchmake on boost percentage', () => {
    assert.doesNotMatch(join, /ORDER BY.*boost/i);
    assert.match(join, /ORDER BY opened_at ASC/);
  });
});

describe('promo schema', () => {
  const sql = read('backend/supabase/migrations/20260905120000_prize_boost_promo.sql');

  it('adds catalog, budgets, snapshots, and PROMO_BOOST', () => {
    assert.match(sql, /create table if not exists promo_budgets/);
    assert.match(sql, /create table if not exists boost_catalog/);
    assert.match(sql, /percentage_bps <= 50000/);
    assert.match(sql, /expires_after_hours > 0/);
    assert.match(sql, /max_wager_cents >= 0/);
    assert.match(sql, /boost_bonus_bps/);
    assert.match(sql, /PROMO_BOOST/);
    assert.match(sql, /reserved_cents \+ spent_cents <= allocated_cents/);
  });

  it('indexes inventory and catalog query patterns', () => {
    assert.match(sql, /boosts_user_status_idx/);
    assert.match(sql, /boost_catalog_game_mode_active_idx/);
    assert.match(sql, /match_players_promo_budget_idx/);
  });
});

describe('domain and exports', () => {
  it('adds PROMO_BOOST and listBoosts', () => {
    assert.equal(LEDGER_ENTRY_TYPE.PROMO_BOOST, 'PROMO_BOOST');
    const index = require('../src/index');
    assert.equal(typeof index.listBoosts, 'function');
    assert.equal(typeof index.joinMatch, 'function');
  });
});

describe('shared contracts', () => {
  it('documents listBoosts and join boost snapshot without client payout', () => {
    const list = read('packages/shared/src/api/list-boosts.ts');
    const join = read('packages/shared/src/api/join-match.ts');
    assert.match(list, /LIST_BOOSTS = "listBoosts"/);
    assert.match(list, /percentageBps/);
    assert.match(join, /percentageBps/);
    assert.doesNotMatch(join, /payoutCents/);
  });
});
