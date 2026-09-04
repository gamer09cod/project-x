'use strict';

const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/https');
const { setGlobalOptions } = require('firebase-functions/options');
const { query } = require('./db');
const { ensureProfileHandler, getWalletHandler } = require('./profile');
const { mockDepositHandler } = require('./wallet');

if (!admin.apps || !admin.apps.length) {
  admin.initializeApp();
}

setGlobalOptions({
  region: 'us-central1',
  maxInstances: 2,
});

/** App Check stays off until Phase 9 hardening. Auth is required on money callables. */
const CALLABLE_OPTS = {
  cors: true,
  enforceAppCheck: false,
};

/**
 * Phase 2 smoke callable. Proves this instance can open Postgres.
 */
exports.health = onCall(CALLABLE_OPTS, async () => {
  try {
    const { rows } = await query('SELECT 1 AS ok', []);
    const pgOk = Number(rows[0] && rows[0].ok) === 1;
    if (!pgOk) {
      throw new HttpsError('internal', 'postgres_unexpected_result');
    }
    return { ok: true, pg: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error('health pg failed:', err && err.message);
    throw new HttpsError('unavailable', 'postgres_unreachable');
  }
});

/** Phase 4: upsert users + rely on wallet trigger. */
exports.ensureProfile = onCall(CALLABLE_OPTS, async (request) => {
  try {
    return await ensureProfileHandler(request);
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error('ensureProfile failed:', err && err.message);
    throw new HttpsError('internal', 'ensure_profile_failed');
  }
});

/** Phase 4: read balance_cents + rating. */
exports.getWallet = onCall(CALLABLE_OPTS, async (request) => {
  try {
    return await getWalletHandler(request);
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error('getWallet failed:', err && err.message);
    throw new HttpsError('internal', 'get_wallet_failed');
  }
});

/** Phase 4: tester ADMIN_CREDIT via apply_ledger_entry. */
exports.mockDeposit = onCall(CALLABLE_OPTS, async (request) => {
  try {
    return await mockDepositHandler(request);
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error('mockDeposit failed:', err && err.message);
    throw new HttpsError('internal', 'mock_deposit_failed');
  }
});
