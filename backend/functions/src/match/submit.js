'use strict';

const { requireAuth, fail, isUuid } = require('../auth');
const { transaction } = require('../db');
const {
  MATCH_MODE,
  MATCH_PLAYER_STATUS,
  MATCH_STATUS,
  STREAK_STATUS,
} = require('../domain');
const { getBalance } = require('../ledger');
const { loadActiveUser } = require('../users');
const { afterScoreAccepted } = require('./settle');
const { floorPvpWinPayout, floorPromoBoostCents } = require('./payout');
const {
  parseScorePayload,
  verifyScorePayload,
  loadUnityBuildAllowlist,
  plausibilityEnforced,
} = require('./verify');

/**
 * @param {import('pg').PoolClient} client
 * @param {string} submitKey
 * @param {string} userId
 */
async function rebuildSubmitResponse(client, submitKey, userId) {
  const { rows } = await client.query(
    `SELECT mp.match_id, mp.score, mp.seat, mp.boost_id,
            m.status AS match_status, m.stake_cents, m.mode,
            m.seeded_from_streak_id, m.streak_id, m.streak_leg
     FROM match_players mp
     JOIN matches m ON m.id = mp.match_id
     WHERE mp.submit_idempotency_key = $1 AND mp.user_id = $2`,
    [submitKey, userId],
  );
  const row = rows[0];
  if (!row) return null;

  const acceptedScore = Number(row.score);

  if (row.mode === MATCH_MODE.STREAK) {
    const {
      STREAK_LEGS_TOTAL,
      targetForLeg,
      floorStreakPayout: floorPay,
    } = require('./payout');

    let streak = null;
    if (row.streak_id) {
      const streakRes = await client.query(
        `SELECT * FROM streaks WHERE id = $1`,
        [row.streak_id],
      );
      streak = streakRes.rows[0];
    }
    if (!streak) {
      const fb = await client.query(
        `SELECT s.* FROM streaks s
         JOIN matches m ON m.streak_id = s.id
         WHERE m.id = $1`,
        [row.match_id],
      );
      streak = fb.rows[0];
    }

    const balance = await getBalance(client, userId);
    const leg = Number(row.streak_leg) || 1;

    if (streak && streak.status === STREAK_STATUS.ACTIVE) {
      const nextLeg = leg + 1;
      return {
        outcome: 'streak_leg_cleared',
        matchId: row.match_id,
        streakId: streak.id,
        acceptedScore,
        streakStatus: STREAK_STATUS.ACTIVE,
        legCleared: leg,
        nextLeg,
        nextTargetScore: targetForLeg(nextLeg, streak),
        targetScores: [
          Number(streak.target_score_1),
          Number(streak.target_score_2),
          Number(streak.target_score_3),
        ],
        legsTotal: STREAK_LEGS_TOTAL,
        seededPvpMatchId: streak.seeded_pvp_match_id,
        expiresAt: new Date(streak.expires_at).toISOString(),
        payoutCents: 0,
        walletBalanceCents: balance,
      };
    }

    let payoutCents = 0;
    if (streak && streak.status === STREAK_STATUS.WON) {
      payoutCents = floorPay(
        Number(streak.stake_cents),
        Number(streak.multiplier_bps),
      );
    }
    return {
      outcome: 'streak_resolved',
      matchId: row.match_id,
      streakId: streak ? streak.id : row.match_id,
      acceptedScore,
      streakStatus:
        streak &&
        (streak.status === STREAK_STATUS.WON || streak.status === STREAK_STATUS.LOST)
          ? streak.status
          : STREAK_STATUS.LOST,
      currentLeg: leg,
      legsTotal: STREAK_LEGS_TOTAL,
      failReason: streak ? streak.fail_reason : null,
      seededPvpMatchId: streak ? streak.seeded_pvp_match_id : null,
      targetScores: streak
        ? [
            Number(streak.target_score_1),
            Number(streak.target_score_2),
            Number(streak.target_score_3),
          ]
        : undefined,
      payoutCents,
      walletBalanceCents: balance,
    };
  }

  if (row.match_status === MATCH_STATUS.OPEN) {
    return {
      outcome: 'scored_open',
      matchId: row.match_id,
      acceptedScore,
      matchStatus: MATCH_STATUS.OPEN,
      seededFromStreak: Boolean(row.seeded_from_streak_id),
    };
  }
  if (row.match_status === MATCH_STATUS.SETTLED) {
    const others = await client.query(
      `SELECT seat, score, user_id, boost_id, boost_bonus_bps
       FROM match_players WHERE match_id = $1`,
      [row.match_id],
    );
    const a = others.rows.find((p) => Number(p.seat) === 1);
    const b = others.rows.find((p) => Number(p.seat) === 2);
    const scoreA = Number(a && a.score);
    const scoreB = Number(b && b.score);
    let result = 'draw';
    let payoutCents = 0;
    let wagerRefunded = false;
    let boostRefunded = false;
    if (scoreA === scoreB) {
      result = 'draw';
      wagerRefunded = true;
      const mine = others.rows.find((p) => p.user_id === userId);
      boostRefunded = Boolean(mine && mine.boost_id);
    } else if (
      (userId === a.user_id && scoreA > scoreB) ||
      (userId === b.user_id && scoreB > scoreA)
    ) {
      result = 'win';
      const winner = scoreA > scoreB ? a : b;
      const base = floorPvpWinPayout(Number(row.stake_cents), 0);
      const promo = winner.boost_id
        ? floorPromoBoostCents(base, Number(winner.boost_bonus_bps || 0))
        : 0;
      payoutCents = base + promo;
    } else {
      result = 'loss';
    }
    const balance = await getBalance(client, userId);
    return {
      outcome: 'settled',
      matchId: row.match_id,
      acceptedScore,
      result,
      matchStatus: MATCH_STATUS.SETTLED,
      payoutCents,
      wagerRefunded,
      boostRefunded,
      walletBalanceCents: balance,
    };
  }
  return {
    outcome: 'scored_waiting_opponent',
    matchId: row.match_id,
    acceptedScore,
    matchStatus: MATCH_STATUS.PAIRED,
  };
}

/**
 * Phase 7+ submitScore: schema reject vs check-fail→0; settle via afterScoreAccepted.
 * @param {import('firebase-functions/https').CallableRequest} request
 */
async function submitScoreHandler(request) {
  const { uid } = requireAuth(request);
  const data = request.data && typeof request.data === 'object' ? request.data : {};
  const matchId = data.matchId;
  const idempotencyKey = data.idempotencyKey;

  if (!isUuid(matchId)) {
    fail('invalid_argument', 'matchId must be a UUID', 'invalid-argument');
  }
  if (!isUuid(idempotencyKey)) {
    fail('invalid_argument', 'idempotencyKey must be a UUID', 'invalid-argument');
  }

  // Schema-invalid → throw before transaction (do not zero).
  const parsed = parseScorePayload(data.scorePayload);

  return transaction(async (client) => {
    const user = await loadActiveUser(client, uid);

    const replay = await rebuildSubmitResponse(client, idempotencyKey, user.id);
    if (replay) {
      return replay;
    }

    const mpRes = await client.query(
      `SELECT mp.id, mp.status, mp.score_deadline_at, mp.submit_idempotency_key,
              mp.client_run_id,
              m.id AS match_id, m.status AS match_status
       FROM match_players mp
       JOIN matches m ON m.id = mp.match_id
       WHERE mp.match_id = $1 AND mp.user_id = $2
       FOR UPDATE`,
      [matchId, user.id],
    );
    const mp = mpRes.rows[0];
    if (!mp) {
      fail('not_a_participant', 'Not a participant in this match', 'permission-denied');
    }
    if (mp.status !== MATCH_PLAYER_STATUS.RUNNING) {
      fail('not_running', 'Match player is not running', 'failed-precondition');
    }

    const deadline = new Date(mp.score_deadline_at).getTime();
    if (Date.now() > deadline) {
      return { outcome: 'ignored_deadline', matchId };
    }

    const verified = verifyScorePayload(parsed, {
      boundClientRunId: mp.client_run_id,
      unityBuildAllowlist: loadUnityBuildAllowlist(),
    });

    const acceptedScore = verified.acceptedScore;

    await client.query(
      `UPDATE match_players
       SET score = $2,
           score_payload = $3::jsonb,
           score_submitted_at = now(),
           status = $5,
           submit_idempotency_key = $4,
           client_run_id = COALESCE(client_run_id, $6::uuid),
           score_plausibility = $7::jsonb,
           updated_at = now()
       WHERE id = $1`,
      [
        mp.id,
        acceptedScore,
        JSON.stringify(parsed.raw),
        idempotencyKey,
        MATCH_PLAYER_STATUS.SCORED,
        parsed.clientRunId,
        JSON.stringify(verified.plausibility),
      ],
    );

    if (verified.checkFailed) {
      console.warn('submitScore check failed', {
        matchId,
        reason: verified.failReason,
        claimed: parsed.score,
      });
    }

    if (verified.plausibility.signals.length > 0) {
      console.warn('submitScore plausibility signals', {
        matchId,
        enforced: plausibilityEnforced(),
        signals: verified.plausibility.signals.map((s) => s.code),
        metrics: verified.plausibility.metrics,
      });
    }

    return afterScoreAccepted(client, matchId, user.id, acceptedScore);
  });
}

/**
 * Persist a zero score for a running player (cron). Same after-score transitions.
 * @param {import('pg').PoolClient} client
 * @param {{ id: string, match_id: string, user_id: string }} player
 */
async function zeroPlayerScore(client, player) {
  await client.query(
    `UPDATE match_players
     SET score = 0,
         status = $2,
         zeroed_for_disconnect = true,
         score_submitted_at = now(),
         updated_at = now()
     WHERE id = $1 AND status = $3`,
    [player.id, MATCH_PLAYER_STATUS.ZEROED_TIMEOUT, MATCH_PLAYER_STATUS.RUNNING],
  );
  return afterScoreAccepted(client, player.match_id, player.user_id, 0);
}

module.exports = {
  submitScoreHandler,
  parseScorePayload,
  verifyScorePayload,
  zeroPlayerScore,
  rebuildSubmitResponse,
};
