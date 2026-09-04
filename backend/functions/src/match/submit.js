'use strict';

const { requireAuth, fail, isUuid } = require('../auth');
const { transaction } = require('../db');
const { MATCH_PLAYER_STATUS, MATCH_STATUS } = require('../domain');
const { getBalance } = require('../ledger');
const { loadActiveUser } = require('../users');
const { afterScoreAccepted } = require('./settle');

/**
 * Phase 5 stub: accept claimed score without shotLog reconstruction.
 * Disabled unless ALLOW_STUB_SUBMIT=1 or Functions emulator.
 */
function assertStubAllowed() {
  if (process.env.ALLOW_STUB_SUBMIT === '1') return;
  if (process.env.FUNCTIONS_EMULATOR === 'true') return;
  fail(
    'failed-precondition',
    'stub submitScore is disabled (set ALLOW_STUB_SUBMIT=1)',
    'failed-precondition',
  );
}

/**
 * Minimal schema check for Phase 5 stub (full verifier is Phase 7).
 * @param {unknown} payload
 */
function parseStubPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    fail('invalid_argument', 'scorePayload required', 'invalid-argument');
  }
  const p = /** @type {Record<string, unknown>} */ (payload);
  if (p.schemaVersion !== 1) {
    fail('unknown_schema_version', 'Unsupported schemaVersion', 'invalid-argument');
  }
  if (!Number.isInteger(p.score) || /** @type {number} */ (p.score) < 0) {
    fail('invalid_argument', 'score must be a non-negative integer', 'invalid-argument');
  }
  return {
    schemaVersion: 1,
    score: /** @type {number} */ (p.score),
    raw: p,
  };
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} submitKey
 * @param {string} userId
 */
async function rebuildSubmitResponse(client, submitKey, userId) {
  const { rows } = await client.query(
    `SELECT mp.match_id, mp.score, mp.seat, m.status AS match_status, m.stake_cents
     FROM match_players mp
     JOIN matches m ON m.id = mp.match_id
     WHERE mp.submit_idempotency_key = $1 AND mp.user_id = $2`,
    [submitKey, userId],
  );
  const row = rows[0];
  if (!row) return null;

  const acceptedScore = Number(row.score);
  if (row.match_status === MATCH_STATUS.OPEN) {
    return {
      outcome: 'scored_open',
      matchId: row.match_id,
      acceptedScore,
      matchStatus: MATCH_STATUS.OPEN,
      seededFromStreak: false,
    };
  }
  if (row.match_status === MATCH_STATUS.SETTLED) {
    const others = await client.query(
      `SELECT seat, score, user_id FROM match_players WHERE match_id = $1`,
      [row.match_id],
    );
    const a = others.rows.find((p) => Number(p.seat) === 1);
    const b = others.rows.find((p) => Number(p.seat) === 2);
    const scoreA = Number(a && a.score);
    const scoreB = Number(b && b.score);
    let result = 'draw';
    let payoutCents = 0;
    let wagerRefunded = false;
    if (scoreA === scoreB) {
      result = 'draw';
      wagerRefunded = true;
    } else if (
      (userId === a.user_id && scoreA > scoreB) ||
      (userId === b.user_id && scoreB > scoreA)
    ) {
      result = 'win';
      payoutCents = Number(row.stake_cents) * 2;
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
      boostRefunded: false,
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
 * @param {import('firebase-functions/https').CallableRequest} request
 */
async function submitScoreHandler(request) {
  assertStubAllowed();
  const { uid } = requireAuth(request);
  const data = request.data && typeof request.data === 'object' ? request.data : {};
  const matchId = data.matchId;
  const idempotencyKey = data.idempotencyKey;
  const parsed = parseStubPayload(data.scorePayload);

  if (!isUuid(matchId)) {
    fail('invalid_argument', 'matchId must be a UUID', 'invalid-argument');
  }
  if (!isUuid(idempotencyKey)) {
    fail('invalid_argument', 'idempotencyKey must be a UUID', 'invalid-argument');
  }

  return transaction(async (client) => {
    const user = await loadActiveUser(client, uid);

    const replay = await rebuildSubmitResponse(client, idempotencyKey, user.id);
    if (replay) {
      return replay;
    }

    const mpRes = await client.query(
      `SELECT mp.id, mp.status, mp.score_deadline_at, mp.submit_idempotency_key,
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

    const acceptedScore = parsed.score;
    await client.query(
      `UPDATE match_players
       SET score = $2,
           score_payload = $3::jsonb,
           score_submitted_at = now(),
           status = $5,
           submit_idempotency_key = $4,
           updated_at = now()
       WHERE id = $1`,
      [
        mp.id,
        acceptedScore,
        JSON.stringify(parsed.raw),
        idempotencyKey,
        MATCH_PLAYER_STATUS.SCORED,
      ],
    );

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
  parseStubPayload,
  assertStubAllowed,
  zeroPlayerScore,
};
