'use strict';

const crypto = require('crypto');
const { fail } = require('./auth');

/**
 * Deterministic UUID (v4-shaped) from a seed — for cron / derived ledger keys.
 * @param {string} seed
 */
function uuidFromSeed(seed) {
  const bytes = Buffer.from(crypto.createHash('sha256').update(seed).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * @param {import('pg').PoolClient} client
 * @param {{
 *   userId: string,
 *   entryType: string,
 *   deltaCents: number,
 *   idempotencyKey: string,
 *   clientIdempotencyKey: string,
 *   matchId?: string | null,
 *   boostId?: string | null,
 *   streakId?: string | null,
 * }} args
 */
async function applyLedger(client, args) {
  try {
    const { rows } = await client.query(
      `SELECT id, balance_after_cents, delta_cents, entry_type
       FROM apply_ledger_entry(
         $1::uuid,
         $2::ledger_entry_type,
         $3::bigint,
         $4::uuid,
         $5::uuid,
         $6::uuid,
         $7::uuid,
         $8::uuid
       )`,
      [
        args.userId,
        args.entryType,
        args.deltaCents,
        args.idempotencyKey,
        args.clientIdempotencyKey,
        args.matchId || null,
        args.boostId || null,
        args.streakId || null,
      ],
    );
    return rows[0];
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (/insufficient_funds/i.test(msg)) {
      fail('insufficient_funds', 'Insufficient wallet balance', 'failed-precondition');
    }
    throw err;
  }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} userId
 */
async function getBalance(client, userId) {
  const { rows } = await client.query(
    `SELECT balance_cents FROM wallets WHERE user_id = $1`,
    [userId],
  );
  return Number(rows[0] && rows[0].balance_cents);
}

module.exports = { uuidFromSeed, applyLedger, getBalance };
