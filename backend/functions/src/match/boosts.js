'use strict';

const { requireAuth, fail } = require('../auth');
const { transaction } = require('../db');
const { BOOST_STATUS, MATCH_MODE } = require('../domain');
const { floorPvpWinPayout, floorPromoBoostCents } = require('./payout');

const GAME_LABELS = Object.freeze({
  basketball_v1: 'Basketball',
});

/** Seeded row from 20260905120000_prize_boost_promo.sql */
const DEFAULT_CATALOG_ID = '22222222-2222-4222-8222-222222222222';

const MAX_BONUS_BPS = 50000;

function logBoost(event, fields) {
  console.log(
    JSON.stringify({
      event,
      playerId: fields.playerId || null,
      matchId: fields.matchId || null,
      boostId: fields.boostId || null,
      promoBudgetId: fields.promoBudgetId || null,
    }),
  );
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} userId
 */
async function expireStaleBoosts(client, userId) {
  const { rowCount } = await client.query(
    `UPDATE boosts
     SET status = $2, updated_at = now()
     WHERE user_id = $1
       AND status = $3
       AND expires_at <= now()`,
    [userId, BOOST_STATUS.EXPIRED, BOOST_STATUS.AVAILABLE],
  );
  if (rowCount > 0) {
    logBoost('boost_expired', { playerId: userId });
  }
}

/**
 * Lock inventory + catalog + budget; consume; reserve promotional exposure.
 * @param {import('pg').PoolClient} client
 * @param {{
 *   boostId: string,
 *   userId: string,
 *   matchId: string,
 *   gameId: string,
 *   gameMode: string,
 *   stakeCents: number,
 * }} args
 */
async function consumeBoostForJoin(client, args) {
  await expireStaleBoosts(client, args.userId);

  const { rows } = await client.query(
    `SELECT
       b.id,
       b.user_id,
       b.status,
       b.expires_at,
       b.bonus_bps,
       b.catalog_id,
       b.game_id,
       b.game_mode,
       b.max_wager_cents,
       b.promo_budget_id
     FROM boosts b
     WHERE b.id = $1
     FOR UPDATE`,
    [args.boostId],
  );
  const boost = rows[0];
  if (!boost) {
    logBoost('boost_rejected', { playerId: args.userId, boostId: args.boostId, matchId: args.matchId });
    fail('boost_not_found', 'Boost not found', 'failed-precondition');
  }
  if (boost.user_id !== args.userId) {
    logBoost('boost_rejected', { playerId: args.userId, boostId: args.boostId, matchId: args.matchId });
    fail('boost_not_owned', 'Boost is not owned by this player', 'failed-precondition');
  }
  if (boost.status === BOOST_STATUS.CONSUMED) {
    logBoost('duplicate_boost_consumption', {
      playerId: args.userId,
      boostId: args.boostId,
      matchId: args.matchId,
    });
    fail('boost_already_consumed', 'Boost has already been used', 'failed-precondition');
  }
  if (boost.status === BOOST_STATUS.EXPIRED) {
    logBoost('boost_rejected', { playerId: args.userId, boostId: args.boostId, matchId: args.matchId });
    fail('boost_expired', 'Boost has expired', 'failed-precondition');
  }
  if (boost.status !== BOOST_STATUS.AVAILABLE) {
    logBoost('boost_rejected', { playerId: args.userId, boostId: args.boostId, matchId: args.matchId });
    fail('boost_not_active', 'Boost is not available', 'failed-precondition');
  }
  if (new Date(boost.expires_at).getTime() <= Date.now()) {
    await client.query(
      `UPDATE boosts
       SET status = $2, updated_at = now()
       WHERE id = $1 AND status = $3`,
      [args.boostId, BOOST_STATUS.EXPIRED, BOOST_STATUS.AVAILABLE],
    );
    logBoost('boost_expired', { playerId: args.userId, boostId: args.boostId, matchId: args.matchId });
    fail('boost_expired', 'Boost has expired', 'failed-precondition');
  }

  const catalog = await loadCatalogForBoost(client, boost);
  const bonusBps = Number(catalog.percentage_bps);
  if (!Number.isInteger(bonusBps) || bonusBps <= 0 || bonusBps > MAX_BONUS_BPS) {
    fail('boost_not_active', 'Boost percentage is invalid', 'failed-precondition');
  }
  if (!catalog.is_active) {
    logBoost('boost_rejected', { playerId: args.userId, boostId: args.boostId, matchId: args.matchId });
    fail('boost_not_active', 'Boost definition is not active', 'failed-precondition');
  }
  if (catalog.game_id !== args.gameId) {
    logBoost('boost_rejected', { playerId: args.userId, boostId: args.boostId, matchId: args.matchId });
    fail('boost_game_mismatch', 'Boost does not apply to this game', 'failed-precondition');
  }
  if (catalog.game_mode !== args.gameMode) {
    logBoost('boost_rejected', { playerId: args.userId, boostId: args.boostId, matchId: args.matchId });
    fail('boost_mode_mismatch', 'Boost does not apply to this game mode', 'failed-precondition');
  }
  const maxWager = Number(catalog.max_wager_cents);
  if (args.stakeCents > maxWager) {
    logBoost('boost_rejected', { playerId: args.userId, boostId: args.boostId, matchId: args.matchId });
    fail('boost_wager_limit', 'Wager exceeds this boost maximum', 'failed-precondition');
  }

  const basePot = floorPvpWinPayout(args.stakeCents, 0);
  const exposure = floorPromoBoostCents(basePot, bonusBps);
  const budget = await reservePromoExposure(client, {
    promoBudgetId: catalog.promo_budget_id,
    userId: args.userId,
    exposureCents: exposure,
    matchId: args.matchId,
    boostId: args.boostId,
  });

  await client.query(
    `UPDATE boosts
     SET status = $2,
         consumed_at = now(),
         consumed_in_match_id = $3,
         updated_at = now()
     WHERE id = $1 AND status = $4`,
    [args.boostId, BOOST_STATUS.CONSUMED, args.matchId, BOOST_STATUS.AVAILABLE],
  );

  logBoost('boost_consumed', {
    playerId: args.userId,
    boostId: args.boostId,
    matchId: args.matchId,
    promoBudgetId: catalog.promo_budget_id,
  });
  logBoost('boosted_match_created', {
    playerId: args.userId,
    boostId: args.boostId,
    matchId: args.matchId,
    promoBudgetId: catalog.promo_budget_id,
  });

  return {
    boostId: args.boostId,
    bonusBps,
    maxWagerCents: maxWager,
    promoBudgetId: catalog.promo_budget_id,
    promoReservedCents: exposure,
    promoExposureCents: exposure,
    promoMaxPerMatchCents: Number(budget.max_per_match_cents),
  };
}

/**
 * @param {import('pg').PoolClient} client
 * @param {{ catalog_id: string|null, bonus_bps: number, game_id: string|null, game_mode: string|null, max_wager_cents: number|null, promo_budget_id: string|null }} boost
 */
async function loadCatalogForBoost(client, boost) {
  if (boost.catalog_id) {
    const { rows } = await client.query(
      `SELECT id, percentage_bps, game_id, game_mode, max_wager_cents,
              promo_budget_id, is_active
       FROM boost_catalog
       WHERE id = $1
       FOR UPDATE`,
      [boost.catalog_id],
    );
    if (!rows[0]) {
      fail('boost_not_found', 'Boost catalog row missing', 'failed-precondition');
    }
    return rows[0];
  }
  return {
    percentage_bps: Number(boost.bonus_bps),
    game_id: boost.game_id || 'basketball_v1',
    game_mode: boost.game_mode || MATCH_MODE.PVP_1V1,
    max_wager_cents: boost.max_wager_cents == null ? Number.MAX_SAFE_INTEGER : Number(boost.max_wager_cents),
    promo_budget_id: boost.promo_budget_id,
    is_active: true,
  };
}

/**
 * @param {import('pg').PoolClient} client
 * @param {{ promoBudgetId: string|null, userId: string, exposureCents: number, matchId: string, boostId: string }} args
 */
async function reservePromoExposure(client, args) {
  if (!args.promoBudgetId) {
    logBoost('promo_budget_rejected', {
      playerId: args.userId,
      boostId: args.boostId,
      matchId: args.matchId,
    });
    fail('boost_budget_exceeded', 'Promotional budget is not configured', 'failed-precondition');
  }
  if (args.exposureCents <= 0) {
    fail('boost_not_active', 'Promotional exposure must be positive', 'failed-precondition');
  }

  const budgetRes = await client.query(
    `SELECT id, allocated_cents, reserved_cents, spent_cents,
            max_per_match_cents, max_per_player_period_cents, active
     FROM promo_budgets
     WHERE id = $1
     FOR UPDATE`,
    [args.promoBudgetId],
  );
  const budget = budgetRes.rows[0];
  if (!budget || !budget.active) {
    logBoost('promo_budget_rejected', {
      playerId: args.userId,
      boostId: args.boostId,
      matchId: args.matchId,
      promoBudgetId: args.promoBudgetId,
    });
    fail('boost_budget_exceeded', 'Promotional campaign is not active', 'failed-precondition');
  }
  if (args.exposureCents > Number(budget.max_per_match_cents)) {
    logBoost('promo_budget_rejected', {
      playerId: args.userId,
      boostId: args.boostId,
      matchId: args.matchId,
      promoBudgetId: args.promoBudgetId,
    });
    fail('boost_budget_exceeded', 'Promotional amount exceeds the per-match cap', 'failed-precondition');
  }

  const remaining =
    Number(budget.allocated_cents) -
    Number(budget.reserved_cents) -
    Number(budget.spent_cents);
  if (args.exposureCents > remaining) {
    logBoost('promo_budget_rejected', {
      playerId: args.userId,
      boostId: args.boostId,
      matchId: args.matchId,
      promoBudgetId: args.promoBudgetId,
    });
    fail('boost_budget_exceeded', 'Promotional campaign budget is exhausted', 'failed-precondition');
  }

  const period = await lockPlayerPeriod(client, args.promoBudgetId, args.userId);
  const playerUsed = Number(period.reserved_cents) + Number(period.spent_cents);
  if (playerUsed + args.exposureCents > Number(budget.max_per_player_period_cents)) {
    logBoost('promo_budget_rejected', {
      playerId: args.userId,
      boostId: args.boostId,
      matchId: args.matchId,
      promoBudgetId: args.promoBudgetId,
    });
    fail('boost_player_limit', 'Promotional player cap reached', 'failed-precondition');
  }

  const reserved = await client.query(
    `UPDATE promo_budgets
     SET reserved_cents = reserved_cents + $2, updated_at = now()
     WHERE id = $1
       AND active
       AND reserved_cents + spent_cents + $2 <= allocated_cents
     RETURNING id, max_per_match_cents`,
    [args.promoBudgetId, args.exposureCents],
  );
  if (!reserved.rows[0]) {
    logBoost('promo_budget_rejected', {
      playerId: args.userId,
      boostId: args.boostId,
      matchId: args.matchId,
      promoBudgetId: args.promoBudgetId,
    });
    fail('boost_budget_exceeded', 'Promotional campaign budget is exhausted', 'failed-precondition');
  }

  await client.query(
    `UPDATE promo_player_periods
     SET reserved_cents = reserved_cents + $2, updated_at = now()
     WHERE id = $1`,
    [period.id, args.exposureCents],
  );

  return reserved.rows[0];
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} promoBudgetId
 * @param {string} userId
 */
async function lockPlayerPeriod(client, promoBudgetId, userId) {
  await client.query(
    `INSERT INTO promo_player_periods (promo_budget_id, user_id, period_date)
     VALUES ($1, $2, (timezone('utc', now()))::date)
     ON CONFLICT (promo_budget_id, user_id, period_date) DO NOTHING`,
    [promoBudgetId, userId],
  );
  const { rows } = await client.query(
    `SELECT id, reserved_cents, spent_cents
     FROM promo_player_periods
     WHERE promo_budget_id = $1
       AND user_id = $2
       AND period_date = (timezone('utc', now()))::date
     FOR UPDATE`,
    [promoBudgetId, userId],
  );
  return rows[0];
}

/**
 * Convert a reservation into spent promo (winner path).
 * @param {import('pg').PoolClient} client
 * @param {{
 *   userId: string,
 *   promoBudgetId: string|null,
 *   reservedCents: number,
 *   spendCents: number,
 * }} args
 */
/**
 * Atomically clear remaining reservation on a seat. Empty on retry.
 * @param {import('pg').PoolClient} client
 * @param {string} matchPlayerId
 */
async function takeSeatReservationCents(client, matchPlayerId) {
  const { rows } = await client.query(
    `UPDATE match_players
     SET boost_promo_reserved_cents = 0, updated_at = now()
     WHERE id = $1 AND boost_promo_reserved_cents > 0
     RETURNING boost_promo_exposure_cents AS exposure`,
    [matchPlayerId],
  );
  if (!rows[0]) return 0;
  return Math.floor(Number(rows[0].exposure) || 0);
}

async function spendPromoReservation(client, args) {
  const reserved = Math.floor(Number(args.reservedCents) || 0);
  const spend = Math.floor(Number(args.spendCents) || 0);
  if (!args.promoBudgetId || reserved <= 0) return;
  if (spend > reserved) {
    fail('boost_budget_exceeded', 'Promotional settlement exceeds reservation', 'internal');
  }

  await client.query(
    `UPDATE promo_budgets
     SET reserved_cents = reserved_cents - $2,
         spent_cents = spent_cents + $3,
         updated_at = now()
     WHERE id = $1`,
    [args.promoBudgetId, reserved, spend],
  );

  const period = await lockPlayerPeriod(client, args.promoBudgetId, args.userId);
  await client.query(
    `UPDATE promo_player_periods
     SET reserved_cents = GREATEST(0, reserved_cents - $2),
         spent_cents = spent_cents + $3,
         updated_at = now()
     WHERE id = $1`,
    [period.id, reserved, spend],
  );
}

/**
 * Drop an unused reservation (draw, timeout, boosted loser).
 * @param {import('pg').PoolClient} client
 * @param {{
 *   userId: string,
 *   promoBudgetId: string|null,
 *   reservedCents: number,
 * }} args
 */
async function releasePromoReservation(client, args) {
  const reserved = Math.floor(Number(args.reservedCents) || 0);
  if (!args.promoBudgetId || reserved <= 0) return;

  await client.query(
    `UPDATE promo_budgets
     SET reserved_cents = GREATEST(0, reserved_cents - $2), updated_at = now()
     WHERE id = $1`,
    [args.promoBudgetId, reserved],
  );
  const period = await lockPlayerPeriod(client, args.promoBudgetId, args.userId);
  await client.query(
    `UPDATE promo_player_periods
     SET reserved_cents = GREATEST(0, reserved_cents - $2), updated_at = now()
     WHERE id = $1`,
    [period.id, reserved],
  );
}

/**
 * Restore a consumed boost after a draw / no-opponent timeout (§2.6 / §2.5).
 * @param {import('pg').PoolClient} client
 * @param {string} boostId
 * @param {string} matchId
 */
async function restoreBoostOnDraw(client, boostId, matchId) {
  await client.query(
    `UPDATE boosts
     SET status = $2,
         consumed_at = null,
         consumed_in_match_id = null,
         expires_at = now() + make_interval(secs => ttl_seconds),
         last_refunded_at = now(),
         last_refunded_match_id = $3,
         updated_at = now()
     WHERE id = $1 AND status = $4`,
    [boostId, BOOST_STATUS.AVAILABLE, matchId, BOOST_STATUS.CONSUMED],
  );
}

/**
 * @param {import('pg').PoolClient} client
 * @param {{
 *   userId: string,
 *   boostId: string|null,
 *   promoBudgetId: string|null,
 *   reservedCents: number,
 *   restoreInventory: boolean,
 *   matchId: string,
 *   matchPlayerId: string,
 * }} args
 */
async function closeBoostReservation(client, args) {
  await releasePromoReservation(client, {
    userId: args.userId,
    promoBudgetId: args.promoBudgetId,
    reservedCents: args.reservedCents,
  });
  if (args.restoreInventory && args.boostId) {
    await restoreBoostOnDraw(client, args.boostId, args.matchId);
  }
  await client.query(
    `UPDATE match_players
     SET boost_promo_reserved_cents = 0, updated_at = now()
     WHERE id = $1`,
    [args.matchPlayerId],
  );
}

/**
 * @param {import('firebase-functions/https').CallableRequest} request
 */
async function listBoostsHandler(request) {
  const { uid } = requireAuth(request);
  return transaction(async (client) => {
    const upsert = await client.query(
      `INSERT INTO users (firebase_uid)
       VALUES ($1)
       ON CONFLICT (firebase_uid) DO UPDATE
         SET updated_at = now()
       RETURNING id`,
      [uid],
    );
    const userId = upsert.rows[0].id;
    await expireStaleBoosts(client, userId);
    await issueWelcomeBoostIfNone(client, userId);
    const rows = await selectAvailableBoosts(client, userId);
    return {
      boosts: rows.map((row) => ({
        id: row.id,
        name: row.name,
        percentageBps: Number(row.percentage_bps),
        gameId: row.game_id,
        gameName: GAME_LABELS[row.game_id] || row.game_id,
        gameMode: row.game_mode,
        maxWagerCents: row.max_wager_cents == null ? null : Number(row.max_wager_cents),
        expiresAt: new Date(row.expires_at).toISOString(),
        status: row.status,
      })),
    };
  });
}

/**
 * First-time testers have no inventory. Issue one catalog boost if this
 * user has never been granted any row (consumed/expired still count).
 * @param {import('pg').PoolClient} client
 * @param {string} userId
 */
async function issueWelcomeBoostIfNone(client, userId) {
  const existing = await client.query(
    `SELECT id FROM boosts WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  if (existing.rows[0]) return;

  const catalogReady = await client.query(
    `SELECT to_regclass('public.boost_catalog') AS rel`,
    [],
  );
  if (!catalogReady.rows[0] || !catalogReady.rows[0].rel) {
    console.error('boost_issued_skipped', 'boost_catalog missing — run db:apply');
    return;
  }

  const issued = await client.query(
    `INSERT INTO boosts (
       user_id, boost_type, bonus_bps, ttl_seconds, expires_at,
       catalog_id, game_id, game_mode, max_wager_cents, promo_budget_id
     )
     SELECT
       $1,
       'prize_boost',
       c.percentage_bps,
       c.expires_after_hours * 3600,
       now() + make_interval(hours => c.expires_after_hours),
       c.id,
       c.game_id,
       c.game_mode,
       c.max_wager_cents,
       c.promo_budget_id
     FROM boost_catalog c
     WHERE c.id = $2 AND c.is_active
     RETURNING id`,
    [userId, DEFAULT_CATALOG_ID],
  );
  if (issued.rows[0]) {
    logBoost('boost_issued', {
      playerId: userId,
      boostId: issued.rows[0].id,
    });
  }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} userId
 */
async function selectAvailableBoosts(client, userId) {
  const catalogReady = await client.query(
    `SELECT to_regclass('public.boost_catalog') AS rel`,
    [],
  );
  if (catalogReady.rows[0] && catalogReady.rows[0].rel) {
    const { rows } = await client.query(
      `SELECT
         b.id,
         b.status,
         b.expires_at,
         coalesce(c.percentage_bps, b.bonus_bps) AS percentage_bps,
         coalesce(c.game_id, b.game_id, 'basketball_v1') AS game_id,
         coalesce(c.game_mode, b.game_mode, 'pvp_1v1') AS game_mode,
         coalesce(c.max_wager_cents, b.max_wager_cents) AS max_wager_cents,
         coalesce(c.name, 'Prize Boost') AS name
       FROM boosts b
       LEFT JOIN boost_catalog c ON c.id = b.catalog_id
       WHERE b.user_id = $1
         AND b.status = $2
         AND b.expires_at > now()
       ORDER BY b.expires_at ASC`,
      [userId, BOOST_STATUS.AVAILABLE],
    );
    return rows;
  }
  const { rows } = await client.query(
    `SELECT
       id,
       status,
       expires_at,
       bonus_bps AS percentage_bps,
       'basketball_v1' AS game_id,
       'pvp_1v1' AS game_mode,
       NULL::bigint AS max_wager_cents,
       'Prize Boost' AS name
     FROM boosts
     WHERE user_id = $1
       AND status = $2
       AND expires_at > now()
     ORDER BY expires_at ASC`,
    [userId, BOOST_STATUS.AVAILABLE],
  );
  return rows;
}

module.exports = {
  consumeBoostForJoin,
  restoreBoostOnDraw,
  releasePromoReservation,
  spendPromoReservation,
  takeSeatReservationCents,
  closeBoostReservation,
  listBoostsHandler,
  expireStaleBoosts,
  issueWelcomeBoostIfNone,
  DEFAULT_CATALOG_ID,
  MAX_BONUS_BPS,
};
