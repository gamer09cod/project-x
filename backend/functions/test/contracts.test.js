'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exportedNumber(src, name) {
  const m = src.match(new RegExp(`export const ${name} = ([\\d_]+)`));
  assert.ok(m, `missing export ${name}`);
  return Number(m[1].replaceAll('_', ''));
}

describe('score clocks', () => {
  const src = read('packages/shared/src/score-payload.ts');

  it('locks run + buzzer + slack = 67000 and submit window 75s', () => {
    const run = exportedNumber(src, 'RUN_DURATION_MS');
    const buzzer = exportedNumber(src, 'BUZZER_BEATER_BONUS_MS');
    const slack = exportedNumber(src, 'SCORE_DURATION_SLACK_MS');
    const submit = exportedNumber(src, 'SCORE_SUBMIT_WINDOW_MS');

    assert.equal(run, 60_000);
    assert.equal(buzzer, 5_000);
    assert.equal(slack, 2_000);
    assert.equal(run + buzzer + slack, 67_000);
    assert.match(
      src,
      /export const MAX_DURATION_MS =\s*RUN_DURATION_MS \+ BUZZER_BEATER_BONUS_MS \+ SCORE_DURATION_SLACK_MS/,
    );
    assert.equal(submit, 75_000);
    assert.match(src, /export const MATCHMAKING_TIMEOUT_MS = 15 \* 60 \* 1000/);
  });

  it('requires schemaVersion 1 and a monotone shotLog comment', () => {
    assert.match(src, /SCORE_PAYLOAD_SCHEMA_VERSION = 1/);
    assert.match(src, /non-decreasing/);
    assert.match(src, /hasUsedBuzzerBeater/);
  });
});

describe('rating constants', () => {
  const src = read('packages/shared/src/rating.ts');

  it('starts at 1000 with ±20', () => {
    assert.equal(exportedNumber(src, 'RATING_START'), 1000);
    assert.equal(exportedNumber(src, 'RATING_WIN_DELTA'), 20);
    assert.equal(exportedNumber(src, 'RATING_LOSS_DELTA'), 20);
  });
});

describe('money', () => {
  const src = read('packages/shared/src/money.ts');

  it('rejects non-integer cents', () => {
    assert.match(src, /Number\.isInteger\(value\)/);
    assert.match(src, /money must be integer cents/);
  });

  it('documents floor-before-ledger (Functions must Math.floor)', () => {
    assert.equal(Math.floor(125.9), 125);
    assert.equal(Math.floor((1000 * 1500) / 10_000), 150);
    assert.ok(!Number.isInteger(1.25));
  });
});

describe('callable names and auth', () => {
  it('exports joinMatch, startStreak, submitScore with App Check required', () => {
    const join = read('packages/shared/src/api/join-match.ts');
    const streak = read('packages/shared/src/api/start-streak.ts');
    const submit = read('packages/shared/src/api/submit-score.ts');

    assert.match(join, /export const JOIN_MATCH = "joinMatch"/);
    assert.match(streak, /export const START_STREAK = "startStreak"/);
    assert.match(submit, /export const SUBMIT_SCORE = "submitScore"/);

    for (const src of [join, streak, submit]) {
      assert.match(src, /idTokenRequired: true/);
      assert.match(src, /appCheckRequired: true/);
      assert.match(src, /idempotencyKey/);
    }
  });

  it('exports Phase 4 ensureProfile, getWallet, mockDeposit', () => {
    const profile = read('packages/shared/src/api/ensure-profile.ts');
    const wallet = read('packages/shared/src/api/get-wallet.ts');
    const deposit = read('packages/shared/src/api/mock-deposit.ts');

    assert.match(profile, /export const ENSURE_PROFILE = "ensureProfile"/);
    assert.match(wallet, /export const GET_WALLET = "getWallet"/);
    assert.match(deposit, /export const MOCK_DEPOSIT = "mockDeposit"/);
    assert.match(deposit, /idempotencyKey/);
    assert.match(deposit, /MOCK_DEPOSIT_MAX_CENTS = 50_000/);
  });

  it('joinMatch request does not include a client payout', () => {
    const join = read('packages/shared/src/api/join-match.ts');
    assert.match(join, /stakeCents/);
    assert.doesNotMatch(join, /payoutCents/);
  });
});

describe('FCFS pair query (requirements)', () => {
  it('pairs on game_id + stake_cents, oldest open first, never rating', () => {
    const req = read('docs/backend/REQUIREMENTS.md');
    const block = req.slice(req.indexOf('```sql'), req.indexOf('```', req.indexOf('```sql') + 1));
    assert.match(block, /status = 'open'/);
    assert.match(block, /game_id = \$1/);
    assert.match(block, /stake_cents = \$2/);
    assert.match(block, /order by opened_at asc/);
    assert.match(block, /for update skip locked/);
    assert.doesNotMatch(block, /rating/);
  });
});

describe('index.js', () => {
  it('exports Phase 2 health and Phase 4 identity/wallet callables', () => {
    const index = require('../src/index');
    assert.equal(typeof index.health, 'function');
    assert.equal(typeof index.ensureProfile, 'function');
    assert.equal(typeof index.getWallet, 'function');
    assert.equal(typeof index.mockDeposit, 'function');
  });
});
