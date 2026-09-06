'use strict';

/**
 * Grant the seeded +25% prize boost to a user.
 *
 *   node backend/functions/scripts/grant-boost.js <firebase_uid|users.id>
 */

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const ENV_FILE = path.resolve(__dirname, '../.env');
const CATALOG_ID = '22222222-2222-4222-8222-222222222222';

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function main() {
  const who = process.argv[2];
  if (!who) {
    console.error('Usage: node backend/functions/scripts/grant-boost.js <firebase_uid|users.id>');
    process.exit(1);
  }
  loadDotEnv(ENV_FILE);
  const host = process.env.PG_HOST;
  if (!host) {
    throw new Error('PG_HOST is not set. Copy backend/functions/.env.example to .env');
  }
  const client = new Client({
    host,
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: process.env.PG_DATABASE || 'postgres',
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    ssl: host === '127.0.0.1' || host === 'localhost'
      ? false
      : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const user = await client.query(
      `SELECT id, firebase_uid FROM users
       WHERE id::text = $1 OR firebase_uid = $1`,
      [who],
    );
    if (!user.rows[0]) {
      throw new Error(`No users row for ${who}. Sign in on the app first.`);
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
       RETURNING id, status, expires_at, bonus_bps`,
      [user.rows[0].id, CATALOG_ID],
    );
    if (!issued.rows[0]) {
      throw new Error('Catalog row missing. Run npm run db:apply first.');
    }
    console.log('[grant-boost] user', user.rows[0]);
    console.log('[grant-boost] boost', issued.rows[0]);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[grant-boost] failed:', err && err.message ? err.message : err);
  process.exit(1);
});
