'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  floorPvpWinPayout,
  floorStreakPayout,
  STREAK_DEFAULT_MULTIPLIER_BPS,
  STREAK_FALLBACK_TARGETS,
  STREAK_LEGS_TOTAL,
  STREAK_TTL_MS,
  targetForLeg,
  DEFAULT_PRIZE_BONUS_BPS,
} = require('../src/match/payout');

const root = path.resolve(__dirname, '../../..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

/**
 * Spec mirror of resolveStreakAfterScore branching (no DB).
 * Used to lock product law from DECISIONS §2.1 / §11.
 */
function classifyStreakLeg({ leg, acceptedScore, target, legsTotal = STREAK_LEGS_TOTAL }) {
  const cleared = acceptedScore >= target;
  if (!cleared) {
    return {
      outcome: 'streak_resolved',
      streakStatus: 'lost',
      payout: false,
      seedOpen: true,
      nextLeg: null,
    };
  }
  if (leg >= legsTotal) {
    return {
      outcome: 'streak_resolved',
      streakStatus: 'won',
      payout: true,
      seedOpen: true,
      nextLeg: null,
    };
  }
  return {
    outcome: 'streak_leg_cleared',
    streakStatus: 'active',
    payout: false,
    seedOpen: true,
    nextLeg: leg + 1,
  };
}

describe('floorPvpWinPayout', () => {
  it('is 2x stake with no boost', () => {
    assert.equal(floorPvpWinPayout(500, 0), 1000);
    assert.equal(floorPvpWinPayout(500), 1000);
  });

  it('applies +15% (1500 bps) with floor', () => {
    assert.equal(DEFAULT_PRIZE_BONUS_BPS, 1500);
    assert.equal(floorPvpWinPayout(500, 1500), 1150);
    assert.equal(floorPvpWinPayout(333, 1500), 765);
  });
});

describe('3-leg streak constants', () => {
  it('locks 2.5x, 3 legs, 24h TTL, fallback ladder 12/15/18', () => {
    assert.equal(STREAK_DEFAULT_MULTIPLIER_BPS, 25000);
    assert.equal(STREAK_LEGS_TOTAL, 3);
    assert.equal(STREAK_TTL_MS, 24 * 60 * 60 * 1000);
    assert.deepEqual(STREAK_FALLBACK_TARGETS, [12, 15, 18]);
    assert.ok(
      STREAK_FALLBACK_TARGETS[0] <= STREAK_FALLBACK_TARGETS[1] &&
        STREAK_FALLBACK_TARGETS[1] <= STREAK_FALLBACK_TARGETS[2],
      'ladder must be ascending',
    );
  });

  it('targetForLeg reads frozen columns', () => {
    const streak = {
      target_score_1: 12,
      target_score_2: 15,
      target_score_3: 18,
    };
    assert.equal(targetForLeg(1, streak), 12);
    assert.equal(targetForLeg(2, streak), 15);
    assert.equal(targetForLeg(3, streak), 18);
  });

  it('payout is floor(stake * 2.5) and only meaningful on full clear', () => {
    assert.equal(floorStreakPayout(100, 25000), 250);
    assert.equal(floorStreakPayout(10000, 25000), 25000);
    assert.equal(floorStreakPayout(1, 25000), 2);
    assert.equal(floorStreakPayout(500, 25000), 1250);
    assert.equal(floorStreakPayout(333, 25000), 832);
    // Net player on clear: -S + 2.5S = +1.5S
    const stake = 500;
    const credit = floorStreakPayout(stake, 25000);
    assert.equal(credit - stake, 750);
  });
});

describe('streak leg decision matrix (§2.1)', () => {
  const ladder = STREAK_FALLBACK_TARGETS;

  it('score == target is a pass', () => {
    const r = classifyStreakLeg({
      leg: 1,
      acceptedScore: ladder[0],
      target: ladder[0],
    });
    assert.equal(r.outcome, 'streak_leg_cleared');
    assert.equal(r.payout, false);
  });

  it('leg 1 miss → lost, seed, no payout', () => {
    const r = classifyStreakLeg({
      leg: 1,
      acceptedScore: ladder[0] - 1,
      target: ladder[0],
    });
    assert.equal(r.outcome, 'streak_resolved');
    assert.equal(r.streakStatus, 'lost');
    assert.equal(r.payout, false);
    assert.equal(r.seedOpen, true);
  });

  it('leg 1 clear → streak_leg_cleared, no payout, next leg 2', () => {
    const r = classifyStreakLeg({
      leg: 1,
      acceptedScore: ladder[0],
      target: ladder[0],
    });
    assert.equal(r.outcome, 'streak_leg_cleared');
    assert.equal(r.streakStatus, 'active');
    assert.equal(r.payout, false);
    assert.equal(r.nextLeg, 2);
    assert.equal(r.seedOpen, true);
  });

  it('leg 2 clear → streak_leg_cleared, next leg 3', () => {
    const r = classifyStreakLeg({
      leg: 2,
      acceptedScore: ladder[1],
      target: ladder[1],
    });
    assert.equal(r.outcome, 'streak_leg_cleared');
    assert.equal(r.nextLeg, 3);
    assert.equal(r.payout, false);
  });

  it('leg 2 miss → lost, no payout', () => {
    const r = classifyStreakLeg({
      leg: 2,
      acceptedScore: 0,
      target: ladder[1],
    });
    assert.equal(r.outcome, 'streak_resolved');
    assert.equal(r.streakStatus, 'lost');
    assert.equal(r.payout, false);
  });

  it('leg 3 clear → won + payout', () => {
    const r = classifyStreakLeg({
      leg: 3,
      acceptedScore: ladder[2],
      target: ladder[2],
    });
    assert.equal(r.outcome, 'streak_resolved');
    assert.equal(r.streakStatus, 'won');
    assert.equal(r.payout, true);
    assert.equal(r.seedOpen, true);
  });

  it('leg 3 miss → lost, no payout (never paid mid-streak)', () => {
    const r = classifyStreakLeg({
      leg: 3,
      acceptedScore: ladder[2] - 1,
      target: ladder[2],
    });
    assert.equal(r.streakStatus, 'lost');
    assert.equal(r.payout, false);
  });

  it('exact target counts as clear (>=)', () => {
    const r = classifyStreakLeg({ leg: 1, acceptedScore: 12, target: 12 });
    assert.equal(r.outcome, 'streak_leg_cleared');
  });

  it('full happy path: clear 1→2→3 only pays on last', () => {
    const steps = [
      classifyStreakLeg({ leg: 1, acceptedScore: 12, target: 12 }),
      classifyStreakLeg({ leg: 2, acceptedScore: 15, target: 15 }),
      classifyStreakLeg({ leg: 3, acceptedScore: 18, target: 18 }),
    ];
    assert.equal(steps[0].payout, false);
    assert.equal(steps[1].payout, false);
    assert.equal(steps[2].payout, true);
    assert.equal(steps[2].streakStatus, 'won');
  });
});

describe('house edge band (§11.1)', () => {
  it('break-even clear rate is 40%; target band is 12–25%', () => {
    // House EV ≈ S * (1 - 2.5p); break-even p = 0.4
    const breakEven = 1 / 2.5;
    assert.equal(breakEven, 0.4);
    const band = { min: 0.12, max: 0.25 };
    assert.ok(band.max < breakEven, 'target clear rate must leave house edge');
  });
});

describe('schema migration: 3-leg streak', () => {
  const sql = read('backend/supabase/migrations/20260904180000_streak_three_legs.sql');
  const applyList = read('backend/functions/scripts/apply-migrations.js');

  it('is registered in apply-migrations.js', () => {
    assert.match(applyList, /20260904180000_streak_three_legs\.sql/);
  });

  it('creates ops ladder with ascending 12/15/18 seed', () => {
    assert.match(sql, /create table if not exists streak_target_ladders/);
    assert.match(sql, /target_1 <= target_2 and target_2 <= target_3/);
    assert.match(sql, /12, 15, 18/);
  });

  it('freezes T1–T3, expires_at, current_leg on streaks', () => {
    assert.match(sql, /target_score_1/);
    assert.match(sql, /target_score_2/);
    assert.match(sql, /target_score_3/);
    assert.match(sql, /expires_at/);
    assert.match(sql, /current_leg/);
    assert.match(sql, /fail_reason/);
    assert.match(sql, /'lost_leg', 'expired', 'abandoned', 'zeroed'/);
  });

  it('links matches.streak_id + streak_leg', () => {
    assert.match(sql, /add column if not exists streak_id/);
    assert.match(sql, /add column if not exists streak_leg/);
    assert.match(sql, /streak_leg between 1 and 3/);
  });
});

describe('schema migration: streak resume', () => {
  const sql = read('backend/supabase/migrations/20260906120000_streak_resume.sql');
  const applyList = read('backend/functions/scripts/apply-migrations.js');

  it('is registered in apply-migrations.js', () => {
    assert.match(applyList, /20260906120000_streak_resume\.sql/);
  });

  it('adds leg scores, terminal timestamps, and per-leg continue keys', () => {
    assert.match(sql, /leg_score_1/);
    assert.match(sql, /completed_at/);
    assert.match(sql, /failed_at/);
    assert.match(sql, /create table if not exists streak_leg_idempotency/);
    assert.match(sql, /streak_leg_idempotency_one_key_per_leg/);
  });
});

describe('source contracts: streak handlers', () => {
  const streakSrc = read('backend/functions/src/match/streak.js');
  const usersSrc = read('backend/functions/src/users.js');
  const cronsNote = read('backend/functions/src/index.js');

  it('pays STREAK_PAYOUT_CREDIT only when leg >= STREAK_LEGS_TOTAL', () => {
    assert.match(streakSrc, /if \(leg >= STREAK_LEGS_TOTAL\)/);
    assert.match(streakSrc, /STREAK_PAYOUT_CREDIT/);
    assert.match(streakSrc, /outcome: 'streak_leg_cleared'/);
  });

  it('expire and abandon forfeit without refund ledger', () => {
    assert.match(streakSrc, /fail_reason = \$3/);
    assert.match(streakSrc, /'expired'/);
    assert.match(streakSrc, /'abandoned'/);
    assert.doesNotMatch(
      streakSrc,
      /STREAK_WAGER_REFUND|MATCH_TIMEOUT_REFUND.*streak|WAGER_REFUND.*abandon/i,
    );
    assert.match(streakSrc, /async function runExpireStreaks/);
    assert.match(streakSrc, /expires_at <= now\(\)/);
    assert.match(streakSrc, /async function getActiveStreakHandler/);
    assert.match(streakSrc, /streak_leg_idempotency/);
  });

  it('seeds open 1v1 per completed leg without a second WAGER_DEBIT', () => {
    assert.match(streakSrc, /async function seedOpenFromLeg/);
    assert.match(streakSrc, /seeded_from_streak_id/);
    assert.match(streakSrc, /no second debit/i);
    // Seed path must not call applyLedger — only INSERT match/player.
    const seedFn = streakSrc.slice(
      streakSrc.indexOf('async function seedOpenFromLeg'),
      streakSrc.indexOf('async function settlePveMatch'),
    );
    assert.doesNotMatch(seedFn, /applyLedger/);
    assert.doesNotMatch(seedFn, /WAGER_DEBIT/);
  });

  it('exports continue / abandon / expire on index', () => {
    assert.match(cronsNote, /exports\.continueStreak/);
    assert.match(cronsNote, /exports\.abandonStreak/);
    assert.match(cronsNote, /exports\.getActiveStreak/);
    assert.match(cronsNote, /exports\.expireStreaks/);
  });

  it('hasActiveMatch ignores open scored pool seats', () => {
    // Must not treat seeded open seat-1 as blocking continueStreak.
    assert.doesNotMatch(
      usersSrc,
      /MATCH_STATUS\.OPEN[\s\S]{0,80}MATCH_STATUS\.PAIRED/,
    );
    assert.match(usersSrc, /mp\.status IN \(\$2, \$3\)/);
  });
});

describe('shared API: streak contracts', () => {
  const start = read('packages/shared/src/api/start-streak.ts');
  const submit = read('packages/shared/src/api/submit-score.ts');
  const errors = read('packages/shared/src/api/errors.ts');

  it('exports start / continue / abandon with 3 legs + expiresAt', () => {
    assert.match(start, /START_STREAK = "startStreak"/);
    assert.match(start, /CONTINUE_STREAK = "continueStreak"/);
    assert.match(start, /ABANDON_STREAK = "abandonStreak"/);
    assert.match(start, /GET_ACTIVE_STREAK = "getActiveStreak"/);
    assert.match(start, /STREAK_LEGS_TOTAL = 3/);
    assert.match(start, /targetScores: \[number, number, number\]/);
    assert.match(start, /expiresAt: IsoTimestamp/);
  });

  it('submitScore includes streak_leg_cleared and payout-only-on-resolve', () => {
    assert.match(submit, /outcome: "streak_leg_cleared"/);
    assert.match(submit, /outcome: "streak_resolved"/);
    assert.match(submit, /Non-zero only on full 3-leg clear/);
  });

  it('adds streak_expired error code', () => {
    assert.match(errors, /"streak_expired"/);
  });
});

describe('solo disconnect zero (settle.js)', () => {
  const settleSrc = read('backend/functions/src/match/settle.js');

  it('treats zeroed_timeout as terminal matchmaking: refund + leave FCFS', () => {
    assert.match(settleSrc, /async function closeMatchmakingOnZeroTimeout/);
    assert.match(settleSrc, /terminal matchmaking outcome/);
    assert.match(settleSrc, /WAGER_REFUND/);
    assert.match(settleSrc, /zeroed-timeout/);
    assert.match(settleSrc, /TIMEOUT_REFUNDED/);
    assert.match(
      settleSrc,
      /ZEROED_TIMEOUT &&\s*\(match\.status === MATCH_STATUS\.LIVE \|\| match\.status === MATCH_STATUS\.OPEN\)/,
    );
  });
});

describe('index exports 3-leg streak', () => {
  it('exports start / continue / abandon / expireStreaks', () => {
    const index = require('../src/index');
    assert.equal(typeof index.startStreak, 'function');
    assert.equal(typeof index.continueStreak, 'function');
    assert.equal(typeof index.abandonStreak, 'function');
    assert.equal(typeof index.getActiveStreak, 'function');
    assert.equal(typeof index.expireStreaks, 'function');
  });
});

describe('domain streak / boost labels', () => {
  it('mirrors Postgres enums', () => {
    const {
      STREAK_STATUS,
      BOOST_STATUS,
      LEDGER_ENTRY_TYPE,
      MATCH_MODE,
    } = require('../src/domain');
    assert.equal(STREAK_STATUS.ACTIVE, 'active');
    assert.equal(STREAK_STATUS.WON, 'won');
    assert.equal(STREAK_STATUS.LOST, 'lost');
    assert.equal(BOOST_STATUS.AVAILABLE, 'available');
    assert.equal(LEDGER_ENTRY_TYPE.STREAK_WAGER_DEBIT, 'STREAK_WAGER_DEBIT');
    assert.equal(LEDGER_ENTRY_TYPE.STREAK_PAYOUT_CREDIT, 'STREAK_PAYOUT_CREDIT');
    assert.equal(LEDGER_ENTRY_TYPE.PROMO_BOOST, 'PROMO_BOOST');
    assert.equal(MATCH_MODE.STREAK, 'streak');
  });
});
