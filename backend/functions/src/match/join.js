'use strict';

const { requireAuth, fail, isUuid } = require('../auth');
const { transaction } = require('../db');
const {
  LEDGER_ENTRY_TYPE,
  MATCH_MODE,
  MATCH_PLAYER_STATUS,
  MATCH_STATUS,
} = require('../domain');
const { applyLedger, getBalance } = require('../ledger');
const { loadActiveUser, hasActiveMatch, hasActiveStreak } = require('../users');
const { consumeBoostForJoin } = require('./boosts');
const { gameTimerFromStartedAt } = require('./gameTimer');

const GAME_ID = 'basketball_v1';

/**
 * Rebuild JoinMatchResponse from an existing match_players row (idempotent replay).
 * @param {import('pg').PoolClient} client
 * @param {string} joinKey
 */
async function rebuildJoinResponse(client, joinKey) {
  const { rows } = await client.query(
    `SELECT
       mp.id AS match_player_id,
       mp.match_id,
       mp.seat,
       mp.stake_cents,
       mp.boost_id,
       mp.boost_bonus_bps,
       mp.boost_max_wager_cents,
       mp.started_at,
       mp.score_deadline_at,
       m.status AS match_status,
       m.mode
     FROM match_players mp
     JOIN matches m ON m.id = mp.match_id
     WHERE mp.join_idempotency_key = $1`,
    [joinKey],
  );
  const row = rows[0];
  if (!row) return null;

  let opponentPostedScore = null;
  if (Number(row.seat) === 2) {
    const opp = await client.query(
      `SELECT score FROM match_players
       WHERE match_id = $1 AND seat = 1`,
      [row.match_id],
    );
    if (opp.rows[0] && opp.rows[0].score != null) {
      opponentPostedScore = Number(opp.rows[0].score);
    }
  }

  const userRes = await client.query(
    `SELECT user_id FROM match_players WHERE id = $1`,
    [row.match_player_id],
  );
  const balance = await getBalance(client, userRes.rows[0].user_id);

  const matchStatus =
    Number(row.seat) === 2 ? MATCH_STATUS.PAIRED : MATCH_STATUS.LIVE;

  const timer = gameTimerFromStartedAt(row.started_at);

  return {
    matchId: row.match_id,
    matchPlayerId: row.match_player_id,
    seat: Number(row.seat),
    mode: MATCH_MODE.PVP_1V1,
    matchStatus,
    stakeCents: Number(row.stake_cents),
    startedAt: new Date(row.started_at).toISOString(),
    scoreDeadlineAt: new Date(row.score_deadline_at).toISOString(),
    serverNowEpochMs: timer.serverNowEpochMs,
    gameStartEpochMs: timer.gameStartEpochMs,
    gameEndEpochMs: timer.gameEndEpochMs,
    boostId: row.boost_id,
    boost: row.boost_id
      ? {
          id: row.boost_id,
          percentageBps: Number(row.boost_bonus_bps || 0),
          maxWagerCents: Number(row.boost_max_wager_cents || 0),
        }
      : null,
    opponentPostedScore,
    walletBalanceCents: balance,
  };
}

/**
 * @param {import('firebase-functions/https').CallableRequest} request
 */
async function joinMatchHandler(request) {
  const { uid } = requireAuth(request);
  const data = request.data && typeof request.data === 'object' ? request.data : {};
  const gameId = data.gameId;
  const stakeRaw = data.stakeCents;
  const boostId = data.boostId == null ? null : data.boostId;
  const idempotencyKey = data.idempotencyKey;

  if (gameId !== GAME_ID) {
    fail('invalid_argument', 'Unsupported gameId', 'invalid-argument');
  }
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
  if (boostId != null && !isUuid(boostId)) {
    fail('invalid_argument', 'boostId must be a UUID or null', 'invalid-argument');
  }

  return transaction(async (client) => {
    const existing = await rebuildJoinResponse(client, idempotencyKey);
    if (existing) {
      return existing;
    }

    const user = await loadActiveUser(client, uid);
    if (await hasActiveMatch(client, user.id)) {
      fail('already_active_match', 'Finish your current match first', 'failed-precondition');
    }
    if (await hasActiveStreak(client, user.id)) {
      fail('already_active_streak', 'Finish your current streak first', 'failed-precondition');
    }

    // FCFS: oldest open 1v1 at this stake. Never filter/order by rating.
    const openRes = await client.query(
      `SELECT id
       FROM matches
       WHERE status = $4
         AND mode = $5
         AND game_id = $1
         AND stake_cents = $2
         AND matchmaking_expires_at > now()
         AND id NOT IN (
           SELECT match_id FROM match_players WHERE user_id = $3
         )
       ORDER BY opened_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [gameId, stakeCents, user.id, MATCH_STATUS.OPEN, MATCH_MODE.PVP_1V1],
    );

    const openMatch = openRes.rows[0];
    let matchId;
    let seat;
    let matchStatus;
    let opponentPostedScore = null;

    if (openMatch) {
      matchId = openMatch.id;

      const seat1 = await client.query(
        `SELECT user_id, score FROM match_players
         WHERE match_id = $1 AND seat = 1
         FOR UPDATE`,
        [matchId],
      );
      if (!seat1.rows[0]) {
        fail('match_not_found', 'Open match missing seat 1', 'not-found');
      }
      if (seat1.rows[0].user_id === user.id) {
        fail('self_match', 'Cannot pair with yourself', 'failed-precondition');
      }
      opponentPostedScore =
        seat1.rows[0].score == null ? null : Number(seat1.rows[0].score);

      seat = 2;
      matchStatus = MATCH_STATUS.PAIRED;
      await client.query(
        `UPDATE matches SET status = $2, updated_at = now() WHERE id = $1`,
        [matchId, MATCH_STATUS.PAIRED],
      );
    } else {
      const created = await client.query(
        `INSERT INTO matches (game_id, mode, status, stake_cents)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [gameId, MATCH_MODE.PVP_1V1, MATCH_STATUS.LIVE, stakeCents],
      );
      matchId = created.rows[0].id;
      seat = 1;
      matchStatus = MATCH_STATUS.LIVE;
    }

    let consumed = null;
    if (boostId != null) {
      logBoostSelected(user.id, boostId, matchId);
      consumed = await consumeBoostForJoin(client, {
        boostId,
        userId: user.id,
        matchId,
        gameId,
        gameMode: MATCH_MODE.PVP_1V1,
        stakeCents,
      });
    }

    const ledger = await applyLedger(client, {
      userId: user.id,
      entryType: LEDGER_ENTRY_TYPE.WAGER_DEBIT,
      deltaCents: -stakeCents,
      idempotencyKey,
      clientIdempotencyKey: idempotencyKey,
      matchId,
      boostId: consumed ? consumed.boostId : null,
    });

    const startedAt = new Date();
    const player = await client.query(
      `INSERT INTO match_players (
         match_id, user_id, seat, status, stake_cents,
         boost_id, boost_bonus_bps, boost_max_wager_cents,
         boost_promo_budget_id, boost_promo_reserved_cents, boost_promo_exposure_cents,
         started_at, join_idempotency_key
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8,
         $9, $10, $11,
         $12, $13
       )
       RETURNING id, started_at, score_deadline_at`,
      [
        matchId,
        user.id,
        seat,
        MATCH_PLAYER_STATUS.RUNNING,
        stakeCents,
        consumed ? consumed.boostId : null,
        consumed ? consumed.bonusBps : null,
        consumed ? consumed.maxWagerCents : null,
        consumed ? consumed.promoBudgetId : null,
        consumed ? consumed.promoReservedCents : 0,
        consumed ? consumed.promoExposureCents : 0,
        startedAt.toISOString(),
        idempotencyKey,
      ],
    );

    return {
      matchId,
      matchPlayerId: player.rows[0].id,
      seat,
      mode: MATCH_MODE.PVP_1V1,
      matchStatus,
      stakeCents,
      startedAt: new Date(player.rows[0].started_at).toISOString(),
      scoreDeadlineAt: new Date(player.rows[0].score_deadline_at).toISOString(),
      ...gameTimerFromStartedAt(player.rows[0].started_at),
      boostId: consumed ? consumed.boostId : null,
      boost: consumed
        ? {
            id: consumed.boostId,
            percentageBps: consumed.bonusBps,
            maxWagerCents: consumed.maxWagerCents,
          }
        : null,
      opponentPostedScore,
      walletBalanceCents: Number(ledger.balance_after_cents),
    };
  });
}

function logBoostSelected(playerId, boostId, matchId) {
  console.log(
    JSON.stringify({
      event: 'boost_selected',
      playerId,
      boostId,
      matchId,
    }),
  );
}

module.exports = { joinMatchHandler, rebuildJoinResponse, GAME_ID };
