'use strict';

const { requireAuth, fail } = require('./auth');
const { query, transaction } = require('./db');
const {
  WELCOME_CREDIT_CENTS,
  randomDisplayName,
  welcomeCreditIdempotencyKey,
} = require('./displayNames');

/**
 * Upsert users by firebase_uid. Wallet row is created by the INSERT trigger.
 * First insert: random display name (if unset) + $10 ADMIN_CREDIT welcome.
 * @param {import('firebase-functions/https').CallableRequest} request
 */
async function ensureProfileHandler(request) {
  const { uid, token } = requireAuth(request);
  const data = request.data && typeof request.data === 'object' ? request.data : {};
  const fromClient =
    typeof data.displayName === 'string' && data.displayName.trim()
      ? data.displayName.trim()
      : null;
  const fromToken =
    typeof token.name === 'string' && token.name.trim()
      ? token.name.trim()
      : null;

  return transaction(async (client) => {
    const initialName = fromClient || fromToken || randomDisplayName();

    const insert = await client.query(
      `INSERT INTO users (firebase_uid, display_name)
       VALUES ($1, $2)
       ON CONFLICT (firebase_uid) DO NOTHING
       RETURNING id, firebase_uid, display_name, status, rating`,
      [uid, initialName],
    );

    let user = insert.rows[0] || null;
    const isNew = Boolean(user);

    if (!user) {
      const existing = await client.query(
        `SELECT id, firebase_uid, display_name, status, rating
         FROM users
         WHERE firebase_uid = $1
         FOR UPDATE`,
        [uid],
      );
      user = existing.rows[0];
      if (!user) {
        fail('invalid_argument', 'profile_upsert_failed', 'internal');
      }

      // Prefer explicit client rename; otherwise backfill a missing name once.
      const nextName =
        fromClient ||
        (!user.display_name ? fromToken || randomDisplayName() : null);
      if (nextName && nextName !== user.display_name) {
        const updated = await client.query(
          `UPDATE users
           SET display_name = $2, updated_at = now()
           WHERE id = $1
           RETURNING id, firebase_uid, display_name, status, rating`,
          [user.id, nextName],
        );
        user = updated.rows[0];
      }
    }

    if (user.status === 'suspended' || user.status === 'banned') {
      fail('user_suspended', 'Account is not active', 'permission-denied');
    }

    if (isNew) {
      const key = welcomeCreditIdempotencyKey(user.id);
      await client.query(
        `SELECT id FROM apply_ledger_entry(
           $1::uuid,
           'ADMIN_CREDIT'::ledger_entry_type,
           $2::bigint,
           $3::uuid,
           $3::uuid,
           NULL::uuid,
           NULL::uuid,
           NULL::uuid
         )`,
        [user.id, WELCOME_CREDIT_CENTS, key],
      );
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

module.exports = {
  ensureProfileHandler,
  getWalletHandler,
  WELCOME_CREDIT_CENTS,
};
