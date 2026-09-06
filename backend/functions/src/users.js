'use strict';

const { fail } = require('./auth');
const {
  MATCH_MODE,
  MATCH_PLAYER_STATUS,
  MATCH_STATUS,
  STREAK_STATUS,
  USER_STATUS,
} = require('./domain');

/**
 * @param {import('pg').PoolClient} client
 * @param {string} firebaseUid
 */
async function loadActiveUser(client, firebaseUid) {
  const { rows } = await client.query(
    `SELECT id, status, rating FROM users WHERE firebase_uid = $1 FOR UPDATE`,
    [firebaseUid],
  );
  const user = rows[0];
  if (!user) {
    fail('invalid_argument', 'Call ensureProfile first', 'not-found');
  }
  if (
    user.status === USER_STATUS.SUSPENDED ||
    user.status === USER_STATUS.BANNED
  ) {
    fail('user_suspended', 'Account is not active', 'permission-denied');
  }
  return user;
}

/**
 * True if the user has an in-progress run (timer ticking).
 * Open pool seats that are already scored (waiting for a challenger) do NOT count —
 * streak seeds must not block continueStreak / further play (§2.1).
 * @param {import('pg').PoolClient} client
 * @param {string} userId
 */
async function hasActiveMatch(client, userId) {
  const { rows } = await client.query(
    `SELECT mp.id
     FROM match_players mp
     JOIN matches m ON m.id = mp.match_id
     WHERE mp.user_id = $1
       AND (
         mp.status IN ($2, $3)
         OR (
           m.mode = $4
           AND m.status = $5
           AND mp.status IN ($2, $3)
         )
         OR (
           m.mode = $6
           AND m.status IN ($5, $7)
           AND mp.status IN ($2, $3)
         )
       )
     LIMIT 1`,
    [
      userId,
      MATCH_PLAYER_STATUS.PENDING,
      MATCH_PLAYER_STATUS.RUNNING,
      MATCH_MODE.STREAK,
      MATCH_STATUS.LIVE,
      MATCH_MODE.PVP_1V1,
      MATCH_STATUS.PAIRED,
    ],
  );
  return Boolean(rows[0]);
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} userId
 */
async function hasActiveStreak(client, userId) {
  const { rows } = await client.query(
    `SELECT id FROM streaks
     WHERE user_id = $1 AND status = $2
     LIMIT 1`,
    [userId, STREAK_STATUS.ACTIVE],
  );
  return Boolean(rows[0]);
}

module.exports = { loadActiveUser, hasActiveMatch, hasActiveStreak };
