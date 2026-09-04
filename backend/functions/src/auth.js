'use strict';

const { HttpsError } = require('firebase-functions/https');

/**
 * @param {import('firebase-functions/https').CallableRequest} request
 * @returns {{ uid: string, token: Record<string, unknown> }}
 */
function requireAuth(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required', {
      code: 'unauthenticated',
    });
  }
  return { uid: request.auth.uid, token: request.auth.token || {} };
}

/**
 * @param {string} code
 * @param {string} message
 * @param {import('firebase-functions/https').FunctionsErrorCode} [httpCode]
 */
function fail(code, message, httpCode = 'failed-precondition') {
  throw new HttpsError(httpCode, message, { code });
}

/**
 * UUID v4 shape check (client idempotency keys).
 * @param {unknown} value
 */
function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

module.exports = { requireAuth, fail, isUuid };
