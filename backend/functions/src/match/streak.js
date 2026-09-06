'use strict';

const { requireAuth, fail, isUuid } = require('../auth');
const { transaction } = require('../db');
const {
  LEDGER_ENTRY_TYPE,
  MATCH_MODE,
  MATCH_PLAYER_STATUS,
  MATCH_STATUS,
  STREAK_STATUS,
} = require('../domain');
const { applyLedger, getBalance, uuidFromSeed } = require('../ledger');
const { loadActiveUser, hasActiveMatch } = require('../users');
const {
  STREAK_DEFAULT_MULTIPLIER_BPS,
  STREAK_FALLBACK_TARGETS,
  STREAK_LEGS_TOTAL,
  STREAK_TTL_MS,
  floorStreakPayout,
  targetForLeg,
} = require('./payout');

const GAME_ID = 'basketball_v1';

/**
 * @param {string} event
 * @param {Record<string, unknown>} fields
 */
function logStreak(event, fields) {
  console.log(JSON.stringify({ event, gameId: GAME_ID, ...fields }));
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} streakId
 */
async function isPastExpiry(client, streakId) {
  const { rows } = await client.query(
    `SELECT expires_at <= now() AS expired FROM streaks WHERE id = $1`,
    [streakId],
  );
  return Boolean(rows[0] && rows[0].expired);
}

/**
 * @param {object} streak
 * @returns {[number|null, number|null, number|null]}
 */
function streakLegScores(streak) {
  return [
    streak.leg_score_1 == null ? null : Number(streak.leg_score_1),
    streak.leg_score_2 == null ? null : Number(streak.leg_score_2),
    streak.leg_score_3 == null ? null : Number(streak.leg_score_3),
  ];
}

/**
 * @param {import('pg').PoolClient} client
 * @param {object} streak
 */
async function expireIfDue(client, streak) {
  if (streak.status !== STREAK_STATUS.ACTIVE) return false;
  if (!(await isPastExpiry(client, streak.id))) return false;
  await failStreak(client, streak, 'expired', { settleRunning: true });
  logStreak('streak_expired', {
    playerId: streak.user_id,
    streakId: streak.id,
    sequence: Number(streak.current_leg),
  });
  return true;
}

/**
 * Ops ladder for stake, else fallback 12/15/18.
 * @param {import('pg').PoolClient} client
 * @param {number} stakeCents
 */
async function loadLadder(client, stakeCents) {
  const { rows } = await client.query(
    `SELECT id, target_1, target_2, target_3, version
     FROM streak_target_ladders
     WHERE game_id = $1
       AND is_active = true
       AND stake_cents_min <= $2
       AND (stake_cents_max IS NULL OR stake_cents_max >= $2)
     ORDER BY stake_cents_min DESC, version DESC
     LIMIT 1`,
    [GAME_ID, stakeCents],
  );
  if (rows[0]) {
    return {
      ladderId: rows[0].id,
      targets: [
        Number(rows[0].target_1),
        Number(rows[0].target_2),
        Number(rows[0].target_3),
      ],
    };
  }
  return { ladderId: null, targets: [...STREAK_FALLBACK_TARGETS] };
}

/**
 * @param {import('pg').PoolClient} client
 * @param {object} streak
 * @param {number} leg
 * @param {string} joinIdempotencyKey
 */
async function startLegMatch(client, streak, leg, joinIdempotencyKey) {
  const stakeCents = Number(streak.stake_cents);
  const matchIns = await client.query(
    `INSERT INTO matches (game_id, mode, status, stake_cents, streak_id, streak_leg)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      GAME_ID,
      MATCH_MODE.STREAK,
      MATCH_STATUS.LIVE,
      stakeCents,
      streak.id,
      leg,
    ],
  );
  const pveMatchId = matchIns.rows[0].id;

  await client.query(
    `UPDATE streaks
     SET pve_match_id = $2, current_leg = $3, updated_at = now()
     WHERE id = $1`,
    [streak.id, pveMatchId, leg],
  );

  const startedAt = new Date();
  const player = await client.query(
    `INSERT INTO match_players (
       match_id, user_id, seat, status, stake_cents,
       started_at, join_idempotency_key
     ) VALUES (
       $1, $2, 1, $3, $4,
       $5, $6
     )
     RETURNING id, started_at, score_deadline_at`,
    [
      pveMatchId,
      streak.user_id,
      MATCH_PLAYER_STATUS.RUNNING,
      stakeCents,
      startedAt.toISOString(),
      joinIdempotencyKey,
    ],
  );

  return {
    pveMatchId,
    matchPlayerId: player.rows[0].id,
    startedAt: new Date(player.rows[0].started_at).toISOString(),
    scoreDeadlineAt: new Date(player.rows[0].score_deadline_at).toISOString(),
    targetScore: targetForLeg(leg, streak),
  };
}

/**
 * Seed open 1v1 from a completed streak leg — no second debit.
 * @param {import('pg').PoolClient} client
 * @param {object} streak
 * @param {number} acceptedScore
 * @param {number} leg
 */
async function seedOpenFromLeg(client, streak, acceptedScore, leg) {
  const stake = Number(streak.stake_cents);
  const seeded = await client.query(
    `INSERT INTO matches (
       game_id, mode, status, stake_cents, seeded_from_streak_id
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [GAME_ID, MATCH_MODE.PVP_1V1, MATCH_STATUS.OPEN, stake, streak.id],
  );
  const seededPvpMatchId = seeded.rows[0].id;
  const joinKey = uuidFromSeed(`streak-seed-join:${streak.id}:leg:${leg}`);
  const submittedAt = new Date().toISOString();
  await client.query(
    `INSERT INTO match_players (
       match_id, user_id, seat, status, stake_cents,
       score, score_submitted_at, join_idempotency_key
     ) VALUES (
       $1, $2, 1, $3, $4,
       $5, $6, $7
     )`,
    [
      seededPvpMatchId,
      streak.user_id,
      MATCH_PLAYER_STATUS.SCORED,
      stake,
      acceptedScore,
      submittedAt,
      joinKey,
    ],
  );
  await client.query(
    `UPDATE streaks
     SET seeded_pvp_match_id = $2, updated_at = now()
     WHERE id = $1`,
    [streak.id, seededPvpMatchId],
  );
  return seededPvpMatchId;
}

async function settlePveMatch(client, matchId) {
  await client.query(
    `UPDATE matches
     SET status = $2, settled_at = now(), updated_at = now()
     WHERE id = $1`,
    [matchId, MATCH_STATUS.SETTLED],
  );
  await client.query(
    `UPDATE match_players
     SET status = $2, updated_at = now()
     WHERE match_id = $1`,
    [matchId, MATCH_PLAYER_STATUS.SETTLED],
  );
}

/**
 * Mark streak lost. Optionally settle a running PvE without seeding.
 * @param {import('pg').PoolClient} client
 * @param {object} streak
 * @param {'lost_leg'|'expired'|'abandoned'|'zeroed'} failReason
 * @param {{ settleRunning?: boolean, seedScore?: number|null, leg?: number }} [opts]
 */
async function failStreak(client, streak, failReason, opts = {}) {
  if (opts.settleRunning && streak.pve_match_id) {
    const mp = await client.query(
      `SELECT id, status FROM match_players
       WHERE match_id = $1 AND user_id = $2
       FOR UPDATE`,
      [streak.pve_match_id, streak.user_id],
    );
    if (mp.rows[0] && mp.rows[0].status === MATCH_PLAYER_STATUS.RUNNING) {
      const score =
        opts.seedScore == null ? 0 : Math.floor(Number(opts.seedScore));
      await client.query(
        `UPDATE match_players
         SET score = $2,
             status = $3,
             score_submitted_at = now(),
             zeroed_for_disconnect = $4,
             updated_at = now()
         WHERE id = $1`,
        [
          mp.rows[0].id,
          score,
          score === 0
            ? MATCH_PLAYER_STATUS.ZEROED_TIMEOUT
            : MATCH_PLAYER_STATUS.SCORED,
          score === 0,
        ],
      );
      await settlePveMatch(client, streak.pve_match_id);
      // Seed only when the leg produced a finished score path (loss/zero/expiry mid-run).
      if (
        opts.seedScore != null ||
        failReason === 'zeroed' ||
        failReason === 'lost_leg' ||
        failReason === 'expired'
      ) {
        const leg = opts.leg || Number(streak.current_leg);
        await seedOpenFromLeg(client, streak, score, leg);
      }
    } else if (streak.pve_match_id) {
      const m = await client.query(
        `SELECT status FROM matches WHERE id = $1 FOR UPDATE`,
        [streak.pve_match_id],
      );
      if (m.rows[0] && m.rows[0].status === MATCH_STATUS.LIVE) {
        await settlePveMatch(client, streak.pve_match_id);
      }
    }
  }

  await client.query(
    `UPDATE streaks
     SET status = $2,
         fail_reason = $3,
         pve_match_id = null,
         failed_at = coalesce(failed_at, now()),
         updated_at = now()
     WHERE id = $1 AND status = $4`,
    [streak.id, STREAK_STATUS.LOST, failReason, STREAK_STATUS.ACTIVE],
  );
  logStreak('streak_failed', {
    playerId: streak.user_id,
    streakId: streak.id,
    sequence: Number(streak.current_leg),
    failReason,
  });
}

function streakPublicTargets(streak) {
  return [
    Number(streak.target_score_1),
    Number(streak.target_score_2),
    Number(streak.target_score_3),
  ];
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} startKey
 */
async function rebuildStartStreakResponse(client, startKey) {
  const { rows } = await client.query(
    `SELECT
       s.id AS streak_id,
       s.user_id,
       s.stake_cents,
       s.multiplier_bps,
       s.target_score_1,
       s.target_score_2,
       s.target_score_3,
       s.status AS streak_status,
       s.pve_match_id,
       s.current_leg,
       s.expires_at,
       mp.id AS match_player_id,
       mp.started_at,
       mp.score_deadline_at
     FROM streaks s
     LEFT JOIN match_players mp
       ON mp.match_id = s.pve_match_id AND mp.user_id = s.user_id
     WHERE s.start_idempotency_key = $1`,
    [startKey],
  );
  const row = rows[0];
  if (!row) return null;

  const balance = await getBalance(client, row.user_id);
  const leg = Number(row.current_leg) || 1;
  const targets = streakPublicTargets(row);

  return {
    streakId: row.streak_id,
    pveMatchId: row.pve_match_id,
    matchPlayerId: row.match_player_id,
    matchStatus: MATCH_STATUS.LIVE,
    streakStatus: STREAK_STATUS.ACTIVE,
    stakeCents: Number(row.stake_cents),
    multiplierBps: Number(row.multiplier_bps),
    targetScore: targets[leg - 1],
    targetScores: targets,
    currentLeg: leg,
    legsTotal: STREAK_LEGS_TOTAL,
    expiresAt: new Date(row.expires_at).toISOString(),
    startedAt: row.started_at
      ? new Date(row.started_at).toISOString()
      : new Date().toISOString(),
    scoreDeadlineAt: row.score_deadline_at
      ? new Date(row.score_deadline_at).toISOString()
      : new Date().toISOString(),
    walletBalanceCents: balance,
  };
}

/**
 * @param {import('firebase-functions/https').CallableRequest} request
 */
async function startStreakHandler(request) {
  const { uid } = requireAuth(request);
  const data = request.data && typeof request.data === 'object' ? request.data : {};
  const stakeRaw = data.stakeCents;
  const idempotencyKey = data.idempotencyKey;

  if (!Number.isInteger(stakeRaw) || stakeRaw <= 0) {
    fail('invalid_argument', 'stakeCents must be a positive integer', 'invalid-argument');
  }
  const stakeCents = Math.floor(stakeRaw);
  if (stakeCents !== stakeRaw) {
    fail('invalid_argument', 'stakeCents must be integer cents', 'invalid-argument');
  }
  if (!isUuid(idempotencyKey)) {
    fail('invalid_argument', 'idempotencyKey must be a UUID', 'invalid-argument');
  }

  return transaction(async (client) => {
    const existing = await rebuildStartStreakResponse(client, idempotencyKey);
    if (existing) {
      return existing;
    }

    const user = await loadActiveUser(client, uid);
    if (await hasActiveMatch(client, user.id)) {
      fail('already_active_match', 'Finish your current match first', 'failed-precondition');
    }
    const activeRes = await client.query(
      `SELECT * FROM streaks
       WHERE user_id = $1 AND status = $2
       FOR UPDATE`,
      [user.id, STREAK_STATUS.ACTIVE],
    );
    if (activeRes.rows[0]) {
      const expired = await expireIfDue(client, activeRes.rows[0]);
      if (!expired) {
        fail('already_active_streak', 'Finish your current streak first', 'failed-precondition');
      }
    }

    const multiplierBps = STREAK_DEFAULT_MULTIPLIER_BPS;
    const ladder = await loadLadder(client, stakeCents);
    const expiresAt = new Date(Date.now() + STREAK_TTL_MS);

    const streakIns = await client.query(
      `INSERT INTO streaks (
         user_id, stake_cents, multiplier_bps,
         target_score, target_score_1, target_score_2, target_score_3,
         status, current_leg, streak_count, expires_at, ladder_id,
         start_idempotency_key
       ) VALUES (
         $1, $2, $3,
         $4, $4, $5, $6,
         $7, 1, 0, $8, $9,
         $10
       )
       RETURNING *`,
      [
        user.id,
        stakeCents,
        multiplierBps,
        ladder.targets[0],
        ladder.targets[1],
        ladder.targets[2],
        STREAK_STATUS.ACTIVE,
        expiresAt.toISOString(),
        ladder.ladderId,
        idempotencyKey,
      ],
    );
    const streak = streakIns.rows[0];

    const ledger = await applyLedger(client, {
      userId: user.id,
      entryType: LEDGER_ENTRY_TYPE.STREAK_WAGER_DEBIT,
      deltaCents: -stakeCents,
      idempotencyKey,
      clientIdempotencyKey: idempotencyKey,
      streakId: streak.id,
    });

    const leg = await startLegMatch(client, streak, 1, idempotencyKey);
    logStreak('streak_created', {
      playerId: user.id,
      streakId: streak.id,
      sequence: 1,
    });
    logStreak('streak_game_started', {
      playerId: user.id,
      streakId: streak.id,
      sequence: 1,
    });

    return {
      streakId: streak.id,
      pveMatchId: leg.pveMatchId,
      matchPlayerId: leg.matchPlayerId,
      matchStatus: MATCH_STATUS.LIVE,
      streakStatus: STREAK_STATUS.ACTIVE,
      stakeCents,
      multiplierBps,
      targetScore: leg.targetScore,
      targetScores: ladder.targets,
      currentLeg: 1,
      legsTotal: STREAK_LEGS_TOTAL,
      expiresAt: expiresAt.toISOString(),
      startedAt: leg.startedAt,
      scoreDeadlineAt: leg.scoreDeadlineAt,
      walletBalanceCents: Number(ledger.balance_after_cents),
    };
  });
}

/**
 * Start the next PvE leg after a cleared mid-streak (no second debit).
 * @param {import('firebase-functions/https').CallableRequest} request
 */
async function continueStreakHandler(request) {
  const { uid } = requireAuth(request);
  const data = request.data && typeof request.data === 'object' ? request.data : {};
  const streakId = data.streakId;
  const idempotencyKey = data.idempotencyKey;

  if (!isUuid(streakId)) {
    fail('invalid_argument', 'streakId must be a UUID', 'invalid-argument');
  }
  if (!isUuid(idempotencyKey)) {
    fail('invalid_argument', 'idempotencyKey must be a UUID', 'invalid-argument');
  }

  return transaction(async (client) => {
    const user = await loadActiveUser(client, uid);

    const byContinue = await client.query(
      `SELECT s.*
       FROM streak_leg_idempotency k
       JOIN streaks s ON s.id = k.streak_id
       WHERE k.idempotency_key = $1
       FOR UPDATE OF s`,
      [idempotencyKey],
    );
    if (byContinue.rows[0]) {
      const s = byContinue.rows[0];
      if (s.user_id !== user.id) {
        fail('idempotency_conflict', 'Idempotency key reused', 'already-exists');
      }
      const mp = await client.query(
        `SELECT id, started_at, score_deadline_at FROM match_players
         WHERE match_id = $1 AND user_id = $2`,
        [s.pve_match_id, user.id],
      );
      const balance = await getBalance(client, user.id);
      const leg = Number(s.current_leg);
      return {
        streakId: s.id,
        pveMatchId: s.pve_match_id,
        matchPlayerId: mp.rows[0].id,
        matchStatus: MATCH_STATUS.LIVE,
        streakStatus: STREAK_STATUS.ACTIVE,
        stakeCents: Number(s.stake_cents),
        multiplierBps: Number(s.multiplier_bps),
        targetScore: targetForLeg(leg, s),
        targetScores: streakPublicTargets(s),
        currentLeg: leg,
        legsTotal: STREAK_LEGS_TOTAL,
        expiresAt: new Date(s.expires_at).toISOString(),
        startedAt: new Date(mp.rows[0].started_at).toISOString(),
        scoreDeadlineAt: new Date(mp.rows[0].score_deadline_at).toISOString(),
        walletBalanceCents: balance,
      };
    }

    const streakRes = await client.query(
      `SELECT * FROM streaks WHERE id = $1 FOR UPDATE`,
      [streakId],
    );
    const streak = streakRes.rows[0];
    if (!streak || streak.user_id !== user.id) {
      fail('match_not_found', 'Streak not found', 'not-found');
    }
    if (streak.status !== STREAK_STATUS.ACTIVE) {
      fail('already_active_streak', 'Streak is not active', 'failed-precondition');
    }
    if (await expireIfDue(client, streak)) {
      fail('streak_expired', 'Streak has expired', 'failed-precondition');
    }

    if (await hasActiveMatch(client, user.id)) {
      fail('already_active_match', 'Finish your current run first', 'failed-precondition');
    }

    const cleared = Number(streak.streak_count);
    const nextLeg = cleared + 1;
    if (nextLeg < 2 || nextLeg > STREAK_LEGS_TOTAL) {
      fail('invalid_argument', 'No next streak leg to continue', 'failed-precondition');
    }
    if (streak.pve_match_id != null) {
      fail('already_active_match', 'Current streak leg already started', 'failed-precondition');
    }
    if (Number(streak.current_leg) !== nextLeg) {
      fail('invalid_argument', 'Streak is not waiting on the next leg', 'failed-precondition');
    }

    try {
      await client.query(
        `INSERT INTO streak_leg_idempotency (idempotency_key, streak_id, kind, leg)
         VALUES ($1, $2, 'continue', $3)`,
        [idempotencyKey, streak.id, nextLeg],
      );
    } catch (err) {
      if (err && err.code === '23505') {
        fail('already_active_match', 'Current streak leg already started', 'failed-precondition');
      }
      throw err;
    }
    await client.query(
      `UPDATE streaks SET continue_idempotency_key = $2, updated_at = now() WHERE id = $1`,
      [streak.id, idempotencyKey],
    );

    const leg = await startLegMatch(client, streak, nextLeg, idempotencyKey);
    logStreak('streak_game_started', {
      playerId: user.id,
      streakId: streak.id,
      sequence: nextLeg,
    });
    const balance = await getBalance(client, user.id);

    return {
      streakId: streak.id,
      pveMatchId: leg.pveMatchId,
      matchPlayerId: leg.matchPlayerId,
      matchStatus: MATCH_STATUS.LIVE,
      streakStatus: STREAK_STATUS.ACTIVE,
      stakeCents: Number(streak.stake_cents),
      multiplierBps: Number(streak.multiplier_bps),
      targetScore: leg.targetScore,
      targetScores: streakPublicTargets(streak),
      currentLeg: nextLeg,
      legsTotal: STREAK_LEGS_TOTAL,
      expiresAt: new Date(streak.expires_at).toISOString(),
      startedAt: leg.startedAt,
      scoreDeadlineAt: leg.scoreDeadlineAt,
      walletBalanceCents: balance,
    };
  });
}

/**
 * Quit mid-streak = failure, no refund (§2.1 / §11.2).
 * @param {import('firebase-functions/https').CallableRequest} request
 */
async function abandonStreakHandler(request) {
  const { uid } = requireAuth(request);
  const data = request.data && typeof request.data === 'object' ? request.data : {};
  const streakId = data.streakId;
  const idempotencyKey = data.idempotencyKey;

  if (!isUuid(streakId)) {
    fail('invalid_argument', 'streakId must be a UUID', 'invalid-argument');
  }
  if (!isUuid(idempotencyKey)) {
    fail('invalid_argument', 'idempotencyKey must be a UUID', 'invalid-argument');
  }

  return transaction(async (client) => {
    const user = await loadActiveUser(client, uid);

    const byKey = await client.query(
      `SELECT * FROM streaks WHERE abandon_idempotency_key = $1`,
      [idempotencyKey],
    );
    if (byKey.rows[0]) {
      const s = byKey.rows[0];
      const balance = await getBalance(client, user.id);
      return {
        streakId: s.id,
        streakStatus: STREAK_STATUS.LOST,
        failReason: s.fail_reason || 'abandoned',
        walletBalanceCents: balance,
      };
    }

    const streakRes = await client.query(
      `SELECT * FROM streaks WHERE id = $1 FOR UPDATE`,
      [streakId],
    );
    const streak = streakRes.rows[0];
    if (!streak || streak.user_id !== user.id) {
      fail('match_not_found', 'Streak not found', 'not-found');
    }
    if (streak.status !== STREAK_STATUS.ACTIVE) {
      const balance = await getBalance(client, user.id);
      return {
        streakId: streak.id,
        streakStatus: streak.status,
        failReason: streak.fail_reason,
        walletBalanceCents: balance,
      };
    }

    await client.query(
      `UPDATE streaks SET abandon_idempotency_key = $2 WHERE id = $1`,
      [streak.id, idempotencyKey],
    );
    // Abandon: do not seed unplayed/in-progress as a challenge if never scored —
    // settle running without seed unless they already have a score.
    await failStreak(client, streak, 'abandoned', { settleRunning: true });
    logStreak('streak_quit', {
      playerId: user.id,
      streakId: streak.id,
      sequence: Number(streak.current_leg),
    });

    const balance = await getBalance(client, user.id);
    return {
      streakId: streak.id,
      streakStatus: STREAK_STATUS.LOST,
      failReason: 'abandoned',
      walletBalanceCents: balance,
    };
  });
}

/**
 * After PvE score accepted on a streak leg.
 * @param {import('pg').PoolClient} client
 * @param {{ id: string, stake_cents: string|number, streak_id?: string|null, streak_leg?: number|null }} match
 * @param {string} actingUserId
 * @param {number} acceptedScore
 */
async function resolveStreakAfterScore(client, match, actingUserId, acceptedScore) {
  let streakRes;
  if (match.streak_id) {
    streakRes = await client.query(
      `SELECT * FROM streaks WHERE id = $1 FOR UPDATE`,
      [match.streak_id],
    );
  } else {
    streakRes = await client.query(
      `SELECT * FROM streaks WHERE pve_match_id = $1 FOR UPDATE`,
      [match.id],
    );
  }
  const streak = streakRes.rows[0];
  if (!streak) {
    fail('match_not_found', 'Streak row missing for PvE match', 'not-found');
  }

  const leg = Number(match.streak_leg) || Number(streak.current_leg) || 1;
  const balanceEarly = () => getBalance(client, actingUserId);

  if (streak.status !== STREAK_STATUS.ACTIVE) {
    logStreak('duplicate_submission', {
      playerId: actingUserId,
      streakId: streak.id,
      sequence: leg,
    });
    const balance = await balanceEarly();
    return {
      outcome: 'streak_resolved',
      matchId: match.id,
      streakId: streak.id,
      acceptedScore,
      streakStatus: streak.status,
      currentLeg: leg,
      legsTotal: STREAK_LEGS_TOTAL,
      seededPvpMatchId: streak.seeded_pvp_match_id,
      targetScores: streakPublicTargets(streak),
      payoutCents: 0,
      walletBalanceCents: balance,
    };
  }

  if (await isPastExpiry(client, streak.id)) {
    await settlePveMatch(client, match.id);
    const seededPvpMatchId = await seedOpenFromLeg(
      client,
      streak,
      acceptedScore,
      leg,
    );
    const scoreCol = `leg_score_${leg}`;
    await client.query(
      `UPDATE streaks
       SET status = $2, fail_reason = $3, actual_score = $4,
           seeded_pvp_match_id = $5, pve_match_id = null,
           ${scoreCol} = $6,
           failed_at = coalesce(failed_at, now()),
           updated_at = now()
       WHERE id = $1 AND status = $7`,
      [
        streak.id,
        STREAK_STATUS.LOST,
        'expired',
        acceptedScore,
        seededPvpMatchId,
        acceptedScore,
        STREAK_STATUS.ACTIVE,
      ],
    );
    logStreak('streak_expired', {
      playerId: actingUserId,
      streakId: streak.id,
      sequence: leg,
    });
    const balance = await balanceEarly();
    return {
      outcome: 'streak_resolved',
      matchId: match.id,
      streakId: streak.id,
      acceptedScore,
      streakStatus: STREAK_STATUS.LOST,
      currentLeg: leg,
      legsTotal: STREAK_LEGS_TOTAL,
      failReason: 'expired',
      seededPvpMatchId,
      targetScores: streakPublicTargets(streak),
      payoutCents: 0,
      walletBalanceCents: balance,
    };
  }

  const target = targetForLeg(leg, streak);
  const cleared = acceptedScore >= target;
  const seededPvpMatchId = await seedOpenFromLeg(
    client,
    streak,
    acceptedScore,
    leg,
  );
  await settlePveMatch(client, match.id);

  if (!cleared) {
    const failReason = acceptedScore === 0 ? 'zeroed' : 'lost_leg';
    const scoreCol = `leg_score_${leg}`;
    await client.query(
      `UPDATE streaks
       SET status = $2,
           fail_reason = $3,
           actual_score = $4,
           seeded_pvp_match_id = $5,
           pve_match_id = null,
           ${scoreCol} = $4,
           failed_at = coalesce(failed_at, now()),
           updated_at = now()
       WHERE id = $1 AND status = $6`,
      [
        streak.id,
        STREAK_STATUS.LOST,
        failReason,
        acceptedScore,
        seededPvpMatchId,
        STREAK_STATUS.ACTIVE,
      ],
    );
    logStreak('streak_game_failed', {
      playerId: actingUserId,
      streakId: streak.id,
      sequence: leg,
    });
    logStreak('streak_failed', {
      playerId: actingUserId,
      streakId: streak.id,
      sequence: leg,
      failReason,
    });
    const balance = await balanceEarly();
    return {
      outcome: 'streak_resolved',
      matchId: match.id,
      streakId: streak.id,
      acceptedScore,
      streakStatus: STREAK_STATUS.LOST,
      currentLeg: leg,
      legsTotal: STREAK_LEGS_TOTAL,
      failReason: acceptedScore === 0 ? 'zeroed' : 'lost_leg',
      seededPvpMatchId,
      targetScores: streakPublicTargets(streak),
      payoutCents: 0,
      walletBalanceCents: balance,
    };
  }

  // Leg cleared.
  const newCount = Number(streak.streak_count) + 1;

  if (leg >= STREAK_LEGS_TOTAL) {
    const payoutCents = floorStreakPayout(
      Number(streak.stake_cents),
      Number(streak.multiplier_bps),
    );
    if (payoutCents > 0) {
      await applyLedger(client, {
        userId: streak.user_id,
        entryType: LEDGER_ENTRY_TYPE.STREAK_PAYOUT_CREDIT,
        deltaCents: payoutCents,
        idempotencyKey: uuidFromSeed(
          `${LEDGER_ENTRY_TYPE.STREAK_PAYOUT_CREDIT}:${streak.id}`,
        ),
        clientIdempotencyKey: uuidFromSeed(
          `${LEDGER_ENTRY_TYPE.STREAK_PAYOUT_CREDIT}:client:${streak.id}`,
        ),
        matchId: match.id,
        streakId: streak.id,
      });
    }
    const scoreCol = `leg_score_${leg}`;
    await client.query(
      `UPDATE streaks
       SET status = $2,
           streak_count = $3,
           actual_score = $4,
           seeded_pvp_match_id = $5,
           pve_match_id = null,
           ${scoreCol} = $4,
           completed_at = coalesce(completed_at, now()),
           updated_at = now()
       WHERE id = $1 AND status = $6`,
      [
        streak.id,
        STREAK_STATUS.WON,
        newCount,
        acceptedScore,
        seededPvpMatchId,
        STREAK_STATUS.ACTIVE,
      ],
    );
    logStreak('streak_game_passed', {
      playerId: actingUserId,
      streakId: streak.id,
      sequence: leg,
    });
    logStreak('streak_completed', {
      playerId: actingUserId,
      streakId: streak.id,
      sequence: leg,
    });
    logStreak('streak_payout', {
      playerId: actingUserId,
      streakId: streak.id,
      sequence: leg,
      payoutCents,
    });
    const balance = await balanceEarly();
    return {
      outcome: 'streak_resolved',
      matchId: match.id,
      streakId: streak.id,
      acceptedScore,
      streakStatus: STREAK_STATUS.WON,
      currentLeg: leg,
      legsTotal: STREAK_LEGS_TOTAL,
      seededPvpMatchId,
      targetScores: streakPublicTargets(streak),
      payoutCents,
      walletBalanceCents: balance,
    };
  }

  // Mid-streak: wait for continueStreak (lazy next leg — no 75s clock yet).
  const nextLeg = leg + 1;
  const scoreCol = `leg_score_${leg}`;
  await client.query(
    `UPDATE streaks
     SET streak_count = $2,
         current_leg = $3,
         actual_score = $4,
         seeded_pvp_match_id = $5,
         pve_match_id = null,
         target_score = $6,
         ${scoreCol} = $4,
         updated_at = now()
     WHERE id = $1`,
    [
      streak.id,
      newCount,
      nextLeg,
      acceptedScore,
      seededPvpMatchId,
      targetForLeg(nextLeg, streak),
    ],
  );
  logStreak('streak_game_passed', {
    playerId: actingUserId,
    streakId: streak.id,
    sequence: leg,
  });

  const balance = await balanceEarly();
  return {
    outcome: 'streak_leg_cleared',
    matchId: match.id,
    streakId: streak.id,
    acceptedScore,
    streakStatus: STREAK_STATUS.ACTIVE,
    legCleared: leg,
    nextLeg,
    nextTargetScore: targetForLeg(nextLeg, streak),
    targetScores: streakPublicTargets(streak),
    legsTotal: STREAK_LEGS_TOTAL,
    seededPvpMatchId,
    expiresAt: new Date(streak.expires_at).toISOString(),
    payoutCents: 0,
    walletBalanceCents: balance,
  };
}

/**
 * Cron: active streaks past expires_at → lost, no refund.
 * @returns {Promise<{ expired: number }>}
 */
async function runExpireStreaks() {
  let expired = 0;
  for (;;) {
    const did = await transaction(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM streaks
         WHERE status = $1
           AND expires_at <= now()
         ORDER BY expires_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [STREAK_STATUS.ACTIVE],
      );
      const streak = rows[0];
      if (!streak) return false;
      await expireIfDue(client, streak);
      return true;
    });
    if (!did) break;
    expired += 1;
    if (expired >= 50) break;
  }
  return { expired };
}

/**
 * @param {import('pg').PoolClient} client
 * @param {object} streak
 * @param {string} userId
 */
async function serializeStreakSnapshot(client, streak, userId) {
  const balance = await getBalance(client, userId);
  let matchPlayerId = null;
  let startedAt = null;
  let scoreDeadlineAt = null;
  if (streak.pve_match_id) {
    const mp = await client.query(
      `SELECT id, started_at, score_deadline_at, status
       FROM match_players
       WHERE match_id = $1 AND user_id = $2`,
      [streak.pve_match_id, userId],
    );
    if (mp.rows[0]) {
      matchPlayerId = mp.rows[0].id;
      startedAt = mp.rows[0].started_at
        ? new Date(mp.rows[0].started_at).toISOString()
        : null;
      scoreDeadlineAt = mp.rows[0].score_deadline_at
        ? new Date(mp.rows[0].score_deadline_at).toISOString()
        : null;
    }
  }
  const currentLeg = Number(streak.current_leg) || 1;
  const canResumeRun =
    streak.status === STREAK_STATUS.ACTIVE && Boolean(streak.pve_match_id);
  const canContinue =
    streak.status === STREAK_STATUS.ACTIVE &&
    !streak.pve_match_id &&
    Number(streak.streak_count) >= 1 &&
    currentLeg >= 2 &&
    currentLeg <= STREAK_LEGS_TOTAL;
  return {
    streakId: streak.id,
    streakStatus: streak.status,
    failReason: streak.fail_reason || null,
    stakeCents: Number(streak.stake_cents),
    multiplierBps: Number(streak.multiplier_bps),
    targetScores: streakPublicTargets(streak),
    legScores: streakLegScores(streak),
    currentLeg,
    legsTotal: STREAK_LEGS_TOTAL,
    expiresAt: new Date(streak.expires_at).toISOString(),
    completedAt: streak.completed_at
      ? new Date(streak.completed_at).toISOString()
      : null,
    failedAt: streak.failed_at ? new Date(streak.failed_at).toISOString() : null,
    pveMatchId: streak.pve_match_id,
    matchPlayerId,
    startedAt,
    scoreDeadlineAt,
    canContinue,
    canResumeRun,
    walletBalanceCents: balance,
  };
}

/**
 * Resume / lazy-expire the caller's active streak.
 * @param {import('firebase-functions/https').CallableRequest} request
 */
async function getActiveStreakHandler(request) {
  const { uid } = requireAuth(request);
  return transaction(async (client) => {
    const user = await loadActiveUser(client, uid);
    const { rows } = await client.query(
      `SELECT * FROM streaks
       WHERE user_id = $1 AND status = $2
       FOR UPDATE`,
      [user.id, STREAK_STATUS.ACTIVE],
    );
    const stakeRaw = request.data && request.data.stakeCents;
    const stakeCents =
      Number.isInteger(stakeRaw) && stakeRaw > 0 ? Math.floor(stakeRaw) : 0;
    const ladder = await loadLadder(client, stakeCents);
    const previewTargets = ladder.targets;

    let streak = rows[0];
    if (!streak) {
      return { streak: null, previewTargets };
    }
    if (await expireIfDue(client, streak)) {
      const again = await client.query(`SELECT * FROM streaks WHERE id = $1`, [
        streak.id,
      ]);
      streak = again.rows[0];
    }
    return {
      streak: await serializeStreakSnapshot(client, streak, user.id),
      previewTargets,
    };
  });
}

module.exports = {
  startStreakHandler,
  continueStreakHandler,
  abandonStreakHandler,
  getActiveStreakHandler,
  resolveStreakAfterScore,
  rebuildStartStreakResponse,
  runExpireStreaks,
  failStreak,
  STREAK_DEFAULT_MULTIPLIER_BPS,
  STREAK_FALLBACK_TARGETS,
  STREAK_LEGS_TOTAL,
  STREAK_TTL_MS,
  GAME_ID,
};
