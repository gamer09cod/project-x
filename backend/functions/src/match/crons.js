'use strict';

const { transaction } = require('../db');
const {
  LEDGER_ENTRY_TYPE,
  MATCH_MODE,
  MATCH_PLAYER_STATUS,
  MATCH_STATUS,
} = require('../domain');
const { applyLedger, uuidFromSeed } = require('../ledger');
const { closeBoostReservation } = require('./boosts');
const { zeroPlayerScore } = require('./submit');

/**
 * Zero running players past score_deadline_at (75s disconnect path).
 * @returns {Promise<{ zeroed: number }>}
 */
async function runZeroExpiredScores() {
  let zeroed = 0;
  // Process one-by-one so each uses its own transaction + row locks.
  for (;;) {
    const did = await transaction(async (client) => {
      const { rows } = await client.query(
        `SELECT id, match_id, user_id
         FROM match_players
         WHERE status = $1
           AND score_deadline_at IS NOT NULL
           AND score_deadline_at < now()
         ORDER BY score_deadline_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [MATCH_PLAYER_STATUS.RUNNING],
      );
      if (!rows[0]) return false;
      await zeroPlayerScore(client, rows[0]);
      return true;
    });
    if (!did) break;
    zeroed += 1;
    if (zeroed >= 50) break;
  }
  return { zeroed };
}

/**
 * Refund open matches past matchmaking_expires_at. No auto-win. Rating unchanged.
 * @returns {Promise<{ refunded: number }>}
 */
async function runMatchTimeoutRefunds() {
  let refunded = 0;
  for (;;) {
    const did = await transaction(async (client) => {
      const { rows } = await client.query(
        `SELECT id, stake_cents
         FROM matches
         WHERE status = $1
           AND mode = $2
           AND matchmaking_expires_at IS NOT NULL
           AND matchmaking_expires_at < now()
         ORDER BY matchmaking_expires_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [MATCH_STATUS.OPEN, MATCH_MODE.PVP_1V1],
      );
      const match = rows[0];
      if (!match) return false;

      const players = await client.query(
        `SELECT id, user_id, stake_cents, boost_id,
                boost_promo_budget_id, boost_promo_reserved_cents
         FROM match_players
         WHERE match_id = $1
         FOR UPDATE`,
        [match.id],
      );

      for (const p of players.rows) {
        // Streak-seeded seat 1 has no WAGER_DEBIT on the open row — do not refund.
        const debit = await client.query(
          `SELECT id FROM ledger
           WHERE match_id = $1
             AND wallet_user_id = $2
             AND entry_type = $3
           LIMIT 1`,
          [match.id, p.user_id, LEDGER_ENTRY_TYPE.WAGER_DEBIT],
        );
        if (debit.rows[0]) {
          const stake = Number(p.stake_cents);
          await applyLedger(client, {
            userId: p.user_id,
            entryType: LEDGER_ENTRY_TYPE.MATCH_TIMEOUT_REFUND,
            deltaCents: stake,
            idempotencyKey: uuidFromSeed(
              `${LEDGER_ENTRY_TYPE.MATCH_TIMEOUT_REFUND}:${match.id}:${p.user_id}`,
            ),
            clientIdempotencyKey: uuidFromSeed(
              `${LEDGER_ENTRY_TYPE.MATCH_TIMEOUT_REFUND}:client:${match.id}:${p.user_id}`,
            ),
            matchId: match.id,
          });
        }
        if (p.boost_id) {
          await closeBoostReservation(client, {
            userId: p.user_id,
            boostId: p.boost_id,
            promoBudgetId: p.boost_promo_budget_id,
            reservedCents: Number(p.boost_promo_reserved_cents || 0),
            restoreInventory: true,
            matchId: match.id,
            matchPlayerId: p.id,
          });
        }
        await client.query(
          `UPDATE match_players
           SET status = $2, updated_at = now()
           WHERE id = $1`,
          [p.id, MATCH_PLAYER_STATUS.SETTLED],
        );
      }

      await client.query(
        `UPDATE matches
         SET status = $2, updated_at = now()
         WHERE id = $1`,
        [match.id, MATCH_STATUS.TIMEOUT_REFUNDED],
      );
      return true;
    });
    if (!did) break;
    refunded += 1;
    if (refunded >= 50) break;
  }
  return { refunded };
}

module.exports = { runZeroExpiredScores, runMatchTimeoutRefunds };
