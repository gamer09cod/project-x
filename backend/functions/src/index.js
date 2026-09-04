'use strict';

const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/https');
const { onSchedule } = require('firebase-functions/scheduler');
const { setGlobalOptions } = require('firebase-functions/options');
const { query } = require('./db');
const { ensureProfileHandler, getWalletHandler } = require('./profile');
const { mockDepositHandler } = require('./wallet');
const { joinMatchHandler } = require('./match/join');
const { submitScoreHandler } = require('./match/submit');
const {
  runZeroExpiredScores,
  runMatchTimeoutRefunds,
} = require('./match/crons');

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

function wrap(name, handler) {
  return onCall(CALLABLE_OPTS, async (request) => {
    try {
      return await handler(request);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error(`${name} failed:`, err && err.message);
      throw new HttpsError('internal', `${name}_failed`);
    }
  });
}

/** Phase 2 smoke callable. */
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

exports.ensureProfile = wrap('ensureProfile', ensureProfileHandler);
exports.getWallet = wrap('getWallet', getWalletHandler);
exports.mockDeposit = wrap('mockDeposit', mockDepositHandler);

/** Phase 5: FCFS join + WAGER_DEBIT at start. */
exports.joinMatch = wrap('joinMatch', joinMatchHandler);

/**
 * Phase 5 stub submitScore (no shot reconstruction).
 * Requires ALLOW_STUB_SUBMIT=1 or Functions emulator. Phase 7 replaces verifier.
 */
exports.submitScore = wrap('submitScore', submitScoreHandler);

/** Every minute: zero running players past score_deadline_at. */
exports.zeroExpiredScores = onSchedule(
  { schedule: 'every 1 minutes', timeZone: 'Etc/UTC' },
  async () => {
    const result = await runZeroExpiredScores();
    console.log('zeroExpiredScores', result);
    return result;
  },
);

/** Every minute: MATCH_TIMEOUT_REFUND for expired open matches. */
exports.matchTimeoutRefunds = onSchedule(
  { schedule: 'every 1 minutes', timeZone: 'Etc/UTC' },
  async () => {
    const result = await runMatchTimeoutRefunds();
    console.log('matchTimeoutRefunds', result);
    return result;
  },
);
