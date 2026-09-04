'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const initSql = fs.readFileSync(
  path.join(root, 'backend/supabase/migrations/20260903120000_init.sql'),
  'utf8',
);
const ratingSql = fs.readFileSync(
  path.join(root, 'backend/supabase/migrations/20260903140000_player_rating.sql'),
  'utf8',
);

describe('schema: money', () => {
  it('defines apply_ledger_entry with bigint cents and idempotency', () => {
    assert.match(initSql, /create or replace function apply_ledger_entry\(/);
    assert.match(initSql, /p_delta_cents bigint/);
    assert.match(initSql, /p_idempotency_key uuid/);
    assert.match(initSql, /where idempotency_key = p_idempotency_key/);
    assert.match(initSql, /raise exception 'insufficient_funds'/);
    assert.match(initSql, /delta_cents must be a non-zero integer/);
  });

  it('blocks wallet updates and ledger inserts except via apply_ledger_entry', () => {
    assert.match(initSql, /wallets may only be updated by apply_ledger_entry\(\)/);
    assert.match(initSql, /ledger rows may only be inserted by apply_ledger_entry\(\)/);
    assert.match(initSql, /wallets must be inserted with balance_cents = 0/);
    assert.match(initSql, /constraint wallets_balance_cents_non_negative check \(balance_cents >= 0\)/);
  });

  it('includes MATCH_TIMEOUT_REFUND and mock admin ledger types', () => {
    assert.match(initSql, /'MATCH_TIMEOUT_REFUND'/);
    assert.match(initSql, /'WAGER_DEBIT'/);
    assert.match(initSql, /'STREAK_WAGER_DEBIT'/);
    assert.match(initSql, /'DRAW_REFUND'/);
    assert.match(initSql, /'ADMIN_CREDIT'/);
    assert.match(initSql, /'ADMIN_DEBIT'/);
    assert.doesNotMatch(initSql, /stripe/i);
  });

  it('denies device roles table access', () => {
    assert.match(initSql, /alter table wallets enable row level security/);
    assert.match(initSql, /alter table ledger enable row level security/);
    assert.match(initSql, /revoke all on table wallets from anon, authenticated, public/);
    assert.match(
      initSql,
      /grant execute on function apply_ledger_entry\([\s\S]*?\) to service_role/,
    );
  });
});

describe('schema: matchmaking and rating', () => {
  it('does not order or filter matches by rating', () => {
    assert.doesNotMatch(initSql, /order by[\s\S]{0,40}rating/i);
    assert.doesNotMatch(ratingSql, /order by[\s\S]{0,40}rating/i);
    assert.match(
      ratingSql,
      /Matchmaking is FCFS by game_id \+ stake_cents, never by rating/,
    );
  });

  it('starts rating at 1000 and floors at 0', () => {
    assert.match(
      ratingSql,
      /add column if not exists rating integer not null default 1000/,
    );
    assert.match(ratingSql, /users_rating_non_negative check \(rating >= 0\)/);
  });

  it('requires positive stake_cents and timeout_refunded status', () => {
    assert.match(initSql, /constraint matches_stake_cents_positive check \(stake_cents > 0\)/);
    assert.match(initSql, /'timeout_refunded'/);
    assert.match(initSql, /seeded_from_streak_id/);
  });
});
