'use strict';

const { fail } = require('./auth');
const {
  MATCH_MODE,
  MATCH_PLAYER_STATUS,
  MATCH_STATUS,
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
 * True if the user is still in an unfinished 1v1 / live run.
 * @param {import('pg').PoolClient} client
 * @param {string} userId
 */
async function hasActiveMatch(client, userId) {
  const { rows } = await client.query(
    `SELECT mp.id
     FROM match_players mp
     JOIN matches m ON m.id = mp.match_id
     WHERE mp.user_id = $1
       AND m.mode = $2
       AND (
         mp.status IN ($3, $4)
         OR m.status IN ($5, $6, $7)
       )
       AND m.status NOT IN ($8, $9, $10)
     LIMIT 1`,
    [
      userId,
      MATCH_MODE.PVP_1V1,
      MATCH_PLAYER_STATUS.PENDING,
      MATCH_PLAYER_STATUS.RUNNING,
      MATCH_STATUS.LIVE,
      MATCH_STATUS.OPEN,
      MATCH_STATUS.PAIRED,
      MATCH_STATUS.SETTLED,
      MATCH_STATUS.TIMEOUT_REFUNDED,
      MATCH_STATUS.VOID,
    ],
  );
  return Boolean(rows[0]);
}

module.exports = { loadActiveUser, hasActiveMatch };
