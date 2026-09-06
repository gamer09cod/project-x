'use strict';

const {
  LEDGER_ENTRY_TYPE,
  MATCH_MODE,
  MATCH_PLAYER_STATUS,
  MATCH_STATUS,
} = require('../domain');
const { applyLedger, getBalance, uuidFromSeed } = require('../ledger');
const {
  closeBoostReservation,
  spendPromoReservation,
  takeSeatReservationCents,
} = require('./boosts');
const { floorPvpWinPayout, floorPromoBoostCents } = require('./payout');
const { resolveStreakAfterScore } = require('./streak');

const RATING_WIN_DELTA = 20;
const RATING_LOSS_DELTA = 20;

/**
 * After a player scores (or is zeroed), either open the matchmaking pool,
 * wait for the other seat, settle PvP, or resolve a streak.
 * @param {import('pg').PoolClient} client
 * @param {string} matchId
 * @param {string} actingUserId
 * @param {number} acceptedScore
 */
async function afterScoreAccepted(client, matchId, actingUserId, acceptedScore) {
  // Do not SELECT streak_* here: PvP zero/settle must work even if the streak
  // migration is not applied yet. Load those columns only for streak mode.
  const matchRes = await client.query(
    `SELECT id, status, stake_cents, mode
     FROM matches WHERE id = $1 FOR UPDATE`,
    [matchId],
  );
  const match = matchRes.rows[0];
  if (!match) {
    return {
      outcome: 'scored_waiting_opponent',
      matchId,
      acceptedScore,
      matchStatus: MATCH_STATUS.PAIRED,
    };
  }

  if (match.mode === MATCH_MODE.STREAK) {
    const streakCols = await client.query(
      `SELECT streak_id, streak_leg FROM matches WHERE id = $1`,
      [matchId],
    );
    Object.assign(match, streakCols.rows[0] || {});
    return resolveStreakAfterScore(client, match, actingUserId, acceptedScore);
  }

  if (match.mode !== MATCH_MODE.PVP_1V1) {
    return {
      outcome: 'scored_waiting_opponent',
      matchId,
      acceptedScore,
      matchStatus: MATCH_STATUS.PAIRED,
    };
  }

  const playersRes = await client.query(
    `SELECT id, user_id, seat, status, score, boost_id,
            boost_bonus_bps, boost_max_wager_cents,
            boost_promo_budget_id, boost_promo_reserved_cents,
            boost_promo_exposure_cents, zeroed_for_disconnect
     FROM match_players
     WHERE match_id = $1
     ORDER BY seat ASC
     FOR UPDATE`,
    [matchId],
  );
  const players = playersRes.rows;

  // Already closed out of matchmaking — idempotent no-op for cron/retry.
  if (
    match.status === MATCH_STATUS.TIMEOUT_REFUNDED ||
    match.status === MATCH_STATUS.VOID ||
    match.status === MATCH_STATUS.SETTLED
  ) {
    console.log(
      JSON.stringify({
        event: 'duplicate_settlement',
        matchId,
        playerId: actingUserId,
      }),
    );
    const balance = await getBalance(client, actingUserId);
    return {
      outcome: 'settled',
      matchId,
      acceptedScore,
      result: 'loss',
      matchStatus: match.status,
      payoutCents: 0,
      wagerRefunded: match.status === MATCH_STATUS.TIMEOUT_REFUNDED,
      boostRefunded: false,
      walletBalanceCents: balance,
    };
  }

  const scored = players.filter(
    (p) =>
      p.status === MATCH_PLAYER_STATUS.SCORED ||
      p.status === MATCH_PLAYER_STATUS.ZEROED_TIMEOUT,
  );

  // zeroed_timeout is a terminal matchmaking outcome (§2.5):
  // never enter / remain in FCFS open; refund wager in this same transaction.
  if (
    players.length === 1 &&
    players[0].status === MATCH_PLAYER_STATUS.ZEROED_TIMEOUT &&
    (match.status === MATCH_STATUS.LIVE || match.status === MATCH_STATUS.OPEN)
  ) {
    return closeMatchmakingOnZeroTimeout(
      client,
      match,
      players[0],
      actingUserId,
      acceptedScore,
    );
  }

  // Opener finished first with a real score while still live → FCFS open pool.
  if (
    match.status === MATCH_STATUS.LIVE &&
    players.length === 1 &&
    scored.length === 1
  ) {
    await client.query(
      `UPDATE matches SET status = $2, updated_at = now() WHERE id = $1`,
      [matchId, MATCH_STATUS.OPEN],
    );
    return {
      outcome: 'scored_open',
      matchId,
      acceptedScore,
      matchStatus: MATCH_STATUS.OPEN,
      seededFromStreak: false,
    };
  }

  const bothDone =
    players.length === 2 &&
    players.every(
      (p) =>
        p.status === MATCH_PLAYER_STATUS.SCORED ||
        p.status === MATCH_PLAYER_STATUS.ZEROED_TIMEOUT,
    );

  if (!bothDone) {
    const status =
      match.status === MATCH_STATUS.OPEN || match.status === MATCH_STATUS.PAIRED
        ? MATCH_STATUS.PAIRED
        : match.status;
    return {
      outcome: 'scored_waiting_opponent',
      matchId,
      acceptedScore,
      matchStatus: status,
    };
  }

  return settlePvp(client, match, players, actingUserId, acceptedScore);
}

/**
 * Terminal matchmaking path for solo `zeroed_timeout` (zeroExpiredScores).
 * Same transaction: idempotent WAGER_REFUND (+ boost restore) and remove from FCFS
 * by setting match status to `timeout_refunded` (join only selects `open`).
 * @param {import('pg').PoolClient} client
 * @param {{ id: string, stake_cents: string|number }} match
 * @param {{ id: string, user_id: string, boost_id: string|null }} player
 * @param {string} actingUserId
 * @param {number} acceptedScore
 */
async function closeMatchmakingOnZeroTimeout(
  client,
  match,
  player,
  actingUserId,
  acceptedScore,
) {
  const stake = Math.floor(Number(match.stake_cents));
  let boostRefunded = false;

  const debit = await client.query(
    `SELECT id FROM ledger
     WHERE match_id = $1
       AND wallet_user_id = $2
       AND entry_type = $3
     LIMIT 1`,
    [match.id, player.user_id, LEDGER_ENTRY_TYPE.WAGER_DEBIT],
  );

  // apply_ledger_entry is idempotent on idempotency_key — safe on cron retry.
  if (debit.rows[0] && stake > 0) {
    await applyLedger(client, {
      userId: player.user_id,
      entryType: LEDGER_ENTRY_TYPE.WAGER_REFUND,
      deltaCents: stake,
      idempotencyKey: uuidFromSeed(
        `${LEDGER_ENTRY_TYPE.WAGER_REFUND}:zeroed-timeout:${match.id}:${player.user_id}`,
      ),
      clientIdempotencyKey: uuidFromSeed(
        `${LEDGER_ENTRY_TYPE.WAGER_REFUND}:zeroed-timeout:client:${match.id}:${player.user_id}`,
      ),
      matchId: match.id,
    });
  }

  if (player.boost_id) {
    await closeBoostReservation(client, {
      userId: player.user_id,
      boostId: player.boost_id,
      promoBudgetId: player.boost_promo_budget_id,
      reservedCents: Number(player.boost_promo_reserved_cents || 0),
      restoreInventory: true,
      matchId: match.id,
      matchPlayerId: player.id,
    });
    boostRefunded = true;
  }

  // Atomic close: leave FCFS (not `open`) and mark seat settled.
  await client.query(
    `UPDATE matches
     SET status = $2,
         matchmaking_expires_at = COALESCE(matchmaking_expires_at, now()),
         updated_at = now()
     WHERE id = $1
       AND status IN ($3, $4)`,
    [
      match.id,
      MATCH_STATUS.TIMEOUT_REFUNDED,
      MATCH_STATUS.LIVE,
      MATCH_STATUS.OPEN,
    ],
  );
  await client.query(
    `UPDATE match_players
     SET status = $2, updated_at = now()
     WHERE match_id = $1`,
    [match.id, MATCH_PLAYER_STATUS.SETTLED],
  );

  const balance = await getBalance(client, actingUserId);
  return {
    outcome: 'settled',
    matchId: match.id,
    acceptedScore,
    result: 'loss',
    matchStatus: MATCH_STATUS.TIMEOUT_REFUNDED,
    payoutCents: 0,
    wagerRefunded: Boolean(debit.rows[0]),
    boostRefunded,
    walletBalanceCents: balance,
  };
}

/** @deprecated Use closeMatchmakingOnZeroTimeout */
const refundSoloDisconnect = closeMatchmakingOnZeroTimeout;

/**
 * @param {import('pg').PoolClient} client
 * @param {{ id: string, stake_cents: string|number }} match
 * @param {Array<{ id: string, user_id: string, seat: number, score: number|null, boost_id: string|null }>} players
 * @param {string} actingUserId
 * @param {number} acceptedScore
 */
async function settlePvp(client, match, players, actingUserId, acceptedScore) {
  const stake = Number(match.stake_cents);
  const a = players.find((p) => Number(p.seat) === 1);
  const b = players.find((p) => Number(p.seat) === 2);
  const scoreA = Number(a.score);
  const scoreB = Number(b.score);

  let resultForActor = 'draw';
  let payoutCents = 0;
  let wagerRefunded = false;
  let boostRefunded = false;

  if (scoreA === scoreB) {
    for (const p of [a, b]) {
      await applyLedger(client, {
        userId: p.user_id,
        entryType: LEDGER_ENTRY_TYPE.DRAW_REFUND,
        deltaCents: stake,
        idempotencyKey: uuidFromSeed(
          `${LEDGER_ENTRY_TYPE.DRAW_REFUND}:${match.id}:${p.user_id}`,
        ),
        clientIdempotencyKey: uuidFromSeed(
          `${LEDGER_ENTRY_TYPE.DRAW_REFUND}:client:${match.id}:${p.user_id}`,
        ),
        matchId: match.id,
      });
      if (p.boost_id) {
        await closeBoostReservation(client, {
          userId: p.user_id,
          boostId: p.boost_id,
          promoBudgetId: p.boost_promo_budget_id,
          reservedCents: Number(p.boost_promo_reserved_cents || 0),
          restoreInventory: true,
          matchId: match.id,
          matchPlayerId: p.id,
        });
        if (p.user_id === actingUserId) {
          boostRefunded = true;
        }
      }
    }
    wagerRefunded = true;
    resultForActor = 'draw';
    payoutCents = 0;
  } else {
    const winner = scoreA > scoreB ? a : b;
    const loser = scoreA > scoreB ? b : a;

    const snapshotBps = Math.floor(Number(winner.boost_bonus_bps || 0));
    const basePot = floorPvpWinPayout(stake, 0);
    const promoCents = winner.boost_id
      ? floorPromoBoostCents(basePot, snapshotBps)
      : 0;
    const reserved = await takeSeatReservationCents(client, winner.id);
    const promoPay = promoCents > 0
      ? Math.min(promoCents, reserved > 0 ? reserved : promoCents)
      : 0;

    await applyLedger(client, {
      userId: winner.user_id,
      entryType: LEDGER_ENTRY_TYPE.PAYOUT_CREDIT,
      deltaCents: basePot,
      idempotencyKey: uuidFromSeed(
        `${LEDGER_ENTRY_TYPE.PAYOUT_CREDIT}:${match.id}:${winner.user_id}`,
      ),
      clientIdempotencyKey: uuidFromSeed(
        `${LEDGER_ENTRY_TYPE.PAYOUT_CREDIT}:client:${match.id}:${winner.user_id}`,
      ),
      matchId: match.id,
      boostId: winner.boost_id || null,
    });

    if (promoPay > 0) {
      await applyLedger(client, {
        userId: winner.user_id,
        entryType: LEDGER_ENTRY_TYPE.PROMO_BOOST,
        deltaCents: promoPay,
        idempotencyKey: uuidFromSeed(
          `${LEDGER_ENTRY_TYPE.PROMO_BOOST}:${match.id}:${winner.user_id}`,
        ),
        clientIdempotencyKey: uuidFromSeed(
          `${LEDGER_ENTRY_TYPE.PROMO_BOOST}:client:${match.id}:${winner.user_id}`,
        ),
        matchId: match.id,
        boostId: winner.boost_id,
      });
      if (reserved > 0) {
        await spendPromoReservation(client, {
          userId: winner.user_id,
          promoBudgetId: winner.boost_promo_budget_id,
          reservedCents: reserved,
          spendCents: promoPay,
        });
      }
      console.log(
        JSON.stringify({
          event: 'promotional_payout',
          playerId: winner.user_id,
          matchId: match.id,
          boostId: winner.boost_id,
          promoBudgetId: winner.boost_promo_budget_id,
        }),
      );
    } else if (winner.boost_id) {
      await closeBoostReservation(client, {
        userId: winner.user_id,
        boostId: winner.boost_id,
        promoBudgetId: winner.boost_promo_budget_id,
        reservedCents: reserved,
        restoreInventory: false,
        matchId: match.id,
        matchPlayerId: winner.id,
      });
    }

    if (loser.boost_id) {
      await closeBoostReservation(client, {
        userId: loser.user_id,
        boostId: loser.boost_id,
        promoBudgetId: loser.boost_promo_budget_id,
        reservedCents: Number(loser.boost_promo_reserved_cents || 0),
        restoreInventory: false,
        matchId: match.id,
        matchPlayerId: loser.id,
      });
    }

    const pot = basePot + promoPay;

    await client.query(
      `UPDATE users SET rating = rating + $2, updated_at = now() WHERE id = $1`,
      [winner.user_id, RATING_WIN_DELTA],
    );
    await client.query(
      `UPDATE users
       SET rating = GREATEST(0, rating - $2), updated_at = now()
       WHERE id = $1`,
      [loser.user_id, RATING_LOSS_DELTA],
    );

    if (actingUserId === winner.user_id) {
      resultForActor = 'win';
      payoutCents = pot;
    } else {
      resultForActor = 'loss';
      payoutCents = 0;
    }
  }

  await client.query(
    `UPDATE matches
     SET status = $2, settled_at = now(), updated_at = now()
     WHERE id = $1`,
    [match.id, MATCH_STATUS.SETTLED],
  );
  await client.query(
    `UPDATE match_players
     SET status = $2, updated_at = now()
     WHERE match_id = $1`,
    [match.id, MATCH_PLAYER_STATUS.SETTLED],
  );

  const balance = await getBalance(client, actingUserId);

  return {
    outcome: 'settled',
    matchId: match.id,
    acceptedScore,
    result: resultForActor,
    matchStatus: MATCH_STATUS.SETTLED,
    payoutCents,
    wagerRefunded,
    boostRefunded,
    walletBalanceCents: balance,
  };
}

module.exports = {
  afterScoreAccepted,
  settlePvp,
  closeMatchmakingOnZeroTimeout,
  refundSoloDisconnect,
  RATING_WIN_DELTA,
  RATING_LOSS_DELTA,
};
