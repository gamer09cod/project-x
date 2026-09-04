'use strict';

const {
  LEDGER_ENTRY_TYPE,
  MATCH_MODE,
  MATCH_PLAYER_STATUS,
  MATCH_STATUS,
} = require('../domain');
const { applyLedger, getBalance, uuidFromSeed } = require('../ledger');

const RATING_WIN_DELTA = 20;
const RATING_LOSS_DELTA = 20;

/**
 * After a player scores (or is zeroed), either open the matchmaking pool,
 * wait for the other seat, or settle payouts + rating.
 * @param {import('pg').PoolClient} client
 * @param {string} matchId
 * @param {string} actingUserId
 * @param {number} acceptedScore
 */
async function afterScoreAccepted(client, matchId, actingUserId, acceptedScore) {
  const matchRes = await client.query(
    `SELECT id, status, stake_cents, mode FROM matches WHERE id = $1 FOR UPDATE`,
    [matchId],
  );
  const match = matchRes.rows[0];
  if (!match || match.mode !== MATCH_MODE.PVP_1V1) {
    return {
      outcome: 'scored_waiting_opponent',
      matchId,
      acceptedScore,
      matchStatus: MATCH_STATUS.PAIRED,
    };
  }

  const playersRes = await client.query(
    `SELECT id, user_id, seat, status, score
     FROM match_players
     WHERE match_id = $1
     ORDER BY seat ASC
     FOR UPDATE`,
    [matchId],
  );
  const players = playersRes.rows;
  const scored = players.filter(
    (p) =>
      p.status === MATCH_PLAYER_STATUS.SCORED ||
      p.status === MATCH_PLAYER_STATUS.ZEROED_TIMEOUT,
  );

  // Opener finished first while match still live → open the 15m pool.
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
 * @param {import('pg').PoolClient} client
 * @param {{ id: string, stake_cents: string|number }} match
 * @param {Array<{ id: string, user_id: string, seat: number, score: number|null }>} players
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
    }
    wagerRefunded = true;
    resultForActor = 'draw';
    payoutCents = 0;
  } else {
    const winner = scoreA > scoreB ? a : b;
    const loser = scoreA > scoreB ? b : a;
    const pot = stake * 2;

    await applyLedger(client, {
      userId: winner.user_id,
      entryType: LEDGER_ENTRY_TYPE.PAYOUT_CREDIT,
      deltaCents: pot,
      idempotencyKey: uuidFromSeed(
        `${LEDGER_ENTRY_TYPE.PAYOUT_CREDIT}:${match.id}:${winner.user_id}`,
      ),
      clientIdempotencyKey: uuidFromSeed(
        `${LEDGER_ENTRY_TYPE.PAYOUT_CREDIT}:client:${match.id}:${winner.user_id}`,
      ),
      matchId: match.id,
    });

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
    boostRefunded: false,
    walletBalanceCents: balance,
  };
}

module.exports = {
  afterScoreAccepted,
  settlePvp,
  RATING_WIN_DELTA,
  RATING_LOSS_DELTA,
};
