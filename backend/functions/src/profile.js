'use strict';

const { requireAuth, fail } = require('./auth');
const { query, transaction } = require('./db');

/**
 * Upsert users by firebase_uid. Wallet row is created by the INSERT trigger.
 * @param {import('firebase-functions/https').CallableRequest} request
 */
async function ensureProfileHandler(request) {
  const { uid, token } = requireAuth(request);
  const data = request.data && typeof request.data === 'object' ? request.data : {};
  const fromClient =
    typeof data.displayName === 'string' ? data.displayName.trim() : null;
  const fromToken =
    typeof token.name === 'string' && token.name.trim()
      ? token.name.trim()
      : null;
  const displayName = fromClient || fromToken || null;

  return transaction(async (client) => {
    const upsert = await client.query(
      `INSERT INTO users (firebase_uid, display_name)
       VALUES ($1, $2)
       ON CONFLICT (firebase_uid) DO UPDATE
         SET display_name = COALESCE(EXCLUDED.display_name, users.display_name),
             updated_at = now()
       RETURNING id, firebase_uid, display_name, status, rating`,
      [uid, displayName],
    );
    const user = upsert.rows[0];
    if (!user) {
      fail('invalid_argument', 'profile_upsert_failed', 'internal');
    }
    if (user.status === 'suspended' || user.status === 'banned') {
      fail('user_suspended', 'Account is not active', 'permission-denied');
    }

    const wallet = await client.query(
      `SELECT balance_cents FROM wallets WHERE user_id = $1`,
      [user.id],
    );
    if (!wallet.rows[0]) {
      fail('invalid_argument', 'wallet_missing_after_profile', 'internal');
    }

    return {
      userId: user.id,
      firebaseUid: user.firebase_uid,
      displayName: user.display_name,
      status: user.status,
      rating: Number(user.rating),
      walletBalanceCents: Number(wallet.rows[0].balance_cents),
    };
  });
}

/**
 * Read-only wallet + rating. Never writes.
 * @param {import('firebase-functions/https').CallableRequest} request
 */
async function getWalletHandler(request) {
  const { uid } = requireAuth(request);

  const { rows } = await query(
    `SELECT u.id AS user_id, u.rating, u.status, w.balance_cents
     FROM users u
     JOIN wallets w ON w.user_id = u.id
     WHERE u.firebase_uid = $1`,
    [uid],
  );
  const row = rows[0];
  if (!row) {
    fail('invalid_argument', 'Call ensureProfile first', 'not-found');
  }
  if (row.status === 'suspended' || row.status === 'banned') {
    fail('user_suspended', 'Account is not active', 'permission-denied');
  }

  return {
    userId: row.user_id,
    balanceCents: Number(row.balance_cents),
    rating: Number(row.rating),
  };
}

module.exports = { ensureProfileHandler, getWalletHandler };
