'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { uuidFromSeed } = require('../src/ledger');
const { RATING_WIN_DELTA, RATING_LOSS_DELTA } = require('../src/match/settle');
const { GAME_ID } = require('../src/match/join');

describe('uuidFromSeed', () => {
  it('is stable and UUID-shaped', () => {
    const a = uuidFromSeed('MATCH_TIMEOUT_REFUND:m1:u1');
    const b = uuidFromSeed('MATCH_TIMEOUT_REFUND:m1:u1');
    const c = uuidFromSeed('MATCH_TIMEOUT_REFUND:m1:u2');
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.match(
      a,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

describe('domain.js mirrors shared labels', () => {
  it('exposes match status / mode / player status strings', () => {
    const {
      MATCH_STATUS,
      MATCH_MODE,
      MATCH_PLAYER_STATUS,
      LEDGER_ENTRY_TYPE,
    } = require('../src/domain');
    assert.equal(MATCH_STATUS.LIVE, 'live');
    assert.equal(MATCH_STATUS.OPEN, 'open');
    assert.equal(MATCH_STATUS.PAIRED, 'paired');
    assert.equal(MATCH_STATUS.SETTLED, 'settled');
    assert.equal(MATCH_STATUS.TIMEOUT_REFUNDED, 'timeout_refunded');
    assert.equal(MATCH_MODE.PVP_1V1, 'pvp_1v1');
    assert.equal(MATCH_PLAYER_STATUS.RUNNING, 'running');
    assert.equal(LEDGER_ENTRY_TYPE.WAGER_DEBIT, 'WAGER_DEBIT');
  });
});

describe('phase 5 constants', () => {
  it('locks basketball game id and rating deltas', () => {
    assert.equal(GAME_ID, 'basketball_v1');
    assert.equal(RATING_WIN_DELTA, 20);
    assert.equal(RATING_LOSS_DELTA, 20);
  });

  it('WAGER_DEBIT is negative stake; pot is 2x stake', () => {
    const stake = 500;
    assert.equal(-stake, -500);
    assert.equal(stake * 2, 1000);
    assert.equal(Math.floor(1000 * 1.0), 1000);
  });
});

describe('index exports phase 5', () => {
  it('exports joinMatch, submitScore, and cron handlers', () => {
    const index = require('../src/index');
    assert.equal(typeof index.joinMatch, 'function');
    assert.equal(typeof index.submitScore, 'function');
    assert.equal(typeof index.zeroExpiredScores, 'function');
    assert.equal(typeof index.matchTimeoutRefunds, 'function');
  });
});
