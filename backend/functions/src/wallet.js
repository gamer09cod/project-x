'use strict';

const { requireAuth, fail, isUuid } = require('./auth');
const { transaction } = require('./db');

/** Soft cap matching packages/shared MOCK_DEPOSIT_MAX_CENTS. */
const MOCK_DEPOSIT_MAX_CENTS = 50_000;

/**
 * Tester ADMIN_CREDIT via apply_ledger_entry. No card processor.
 * @param {import('firebase-functions/https').CallableRequest} request
 */
async function mockDepositHandler(request) {
  const { uid } = requireAuth(request);
  const data = request.data && typeof request.data === 'object' ? request.data : {};
  const centsRaw = data.cents;
  const idempotencyKey = data.idempotencyKey;

  if (!Number.isInteger(centsRaw) || centsRaw <= 0) {
    fail('invalid_argument', 'cents must be a positive integer', 'invalid-argument');
  }
  const cents = Math.floor(centsRaw);
  if (cents !== centsRaw) {
    fail('invalid_argument', 'cents must be integer', 'invalid-argument');
  }
  if (cents > MOCK_DEPOSIT_MAX_CENTS) {
    fail(
      'invalid_argument',
      `cents exceeds mock deposit cap (${MOCK_DEPOSIT_MAX_CENTS})`,
      'invalid-argument',
    );
  }
  if (!isUuid(idempotencyKey)) {
    fail('invalid_argument', 'idempotencyKey must be a UUID', 'invalid-argument');
  }

  return transaction(async (client) => {
    const userRes = await client.query(
      `SELECT id, status FROM users WHERE firebase_uid = $1 FOR UPDATE`,
      [uid],
    );
    const user = userRes.rows[0];
    if (!user) {
      fail('invalid_argument', 'Call ensureProfile first', 'not-found');
    }
    if (user.status === 'suspended' || user.status === 'banned') {
      fail('user_suspended', 'Account is not active', 'permission-denied');
    }

    const ledgerRes = await client.query(
      `SELECT id, balance_after_cents, delta_cents
       FROM apply_ledger_entry(
         $1::uuid,
         'ADMIN_CREDIT'::ledger_entry_type,
         $2::bigint,
         $3::uuid,
         $3::uuid,
         NULL::uuid,
         NULL::uuid,
         NULL::uuid
       )`,
      [user.id, cents, idempotencyKey],
    );
    const ledger = ledgerRes.rows[0];
    if (!ledger) {
      fail('invalid_argument', 'ledger_write_failed', 'internal');
    }

    return {
      userId: user.id,
      creditedCents: Number(ledger.delta_cents),
      balanceCents: Number(ledger.balance_after_cents),
      ledgerId: ledger.id,
    };
  });
}

module.exports = { mockDepositHandler, MOCK_DEPOSIT_MAX_CENTS };
