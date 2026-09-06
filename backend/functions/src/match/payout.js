'use strict';

/** Default prize boost: +15% on win pot (SCHEMA / Phase 8). */
const DEFAULT_PRIZE_BONUS_BPS = 1500;

/** Default streak payout: 2.50x stake (10000 = 1x). */
const STREAK_DEFAULT_MULTIPLIER_BPS = 25000;

/** Fallback ladder if no ops row (DECISIONS §11.1). */
const STREAK_FALLBACK_TARGETS = Object.freeze([12, 15, 18]);

const STREAK_LEGS_TOTAL = 3;

/** Wall-clock lifetime of an active streak. */
const STREAK_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Base 1v1 win credit (no promo): 2 × stake. No house rake in v1.
 * Prize boost % applies to this pot, not to net profit after rake.
 * @param {number} stakeCents
 * @param {number} [bonusBps=0]
 */
function floorPvpWinPayout(stakeCents, bonusBps = 0) {
  const stake = Math.floor(stakeCents);
  const bps = Math.floor(bonusBps);
  return Math.floor((2 * stake * (10000 + bps)) / 10000);
}

/**
 * Company-funded promo slice: floor(basePot * bonusBps / 10000).
 * Combined with base pot equals floorPvpWinPayout(stake, bonusBps).
 * @param {number} basePayoutCents
 * @param {number} bonusBps
 */
function floorPromoBoostCents(basePayoutCents, bonusBps) {
  const base = Math.floor(basePayoutCents);
  const bps = Math.floor(bonusBps);
  if (base <= 0 || bps <= 0) return 0;
  return Math.floor((base * bps) / 10000);
}

/**
 * Floored streak win credit: stake * multiplier_bps / 10000.
 * @param {number} stakeCents
 * @param {number} multiplierBps
 */
function floorStreakPayout(stakeCents, multiplierBps) {
  const stake = Math.floor(stakeCents);
  const bps = Math.floor(multiplierBps);
  return Math.floor((stake * bps) / 10000);
}

/**
 * @param {number} leg 1..3
 * @param {{ target_score_1: number, target_score_2: number, target_score_3: number }} streak
 */
function targetForLeg(leg, streak) {
  if (leg === 1) return Number(streak.target_score_1);
  if (leg === 2) return Number(streak.target_score_2);
  return Number(streak.target_score_3);
}

module.exports = {
  DEFAULT_PRIZE_BONUS_BPS,
  STREAK_DEFAULT_MULTIPLIER_BPS,
  STREAK_FALLBACK_TARGETS,
  STREAK_LEGS_TOTAL,
  STREAK_TTL_MS,
  floorPvpWinPayout,
  floorPromoBoostCents,
  floorStreakPayout,
  targetForLeg,
};
