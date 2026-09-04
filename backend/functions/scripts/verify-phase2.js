'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '../../..');
const ENV_FILE = path.join(ROOT, 'backend/functions/.env');

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

function pgConfig() {
  const host = process.env.PG_HOST;
  if (!host) {
    throw new Error('PG_HOST is not set. Copy backend/functions/.env.example to .env (port 5432).');
  }
  return {
    host,
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: process.env.PG_DATABASE || 'postgres',
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    ssl: host === '127.0.0.1' || host === 'localhost'
      ? false
      : { rejectUnauthorized: false },
  };
}

async function main() {
  loadDotEnv(ENV_FILE);
  const client = new Client(pgConfig());
  await client.connect();
  const failures = [];

  try {
    const ver = await client.query('SHOW server_version');
    const version = String(ver.rows[0].server_version);
    console.log(`server_version=${version}`);
    if (!version.startsWith('17.')) {
      failures.push(`expected Postgres 17, got ${version}`);
    }

    const fn = await client.query(
      `SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'apply_ledger_entry'`,
    );
    if (fn.rowCount < 1) failures.push('apply_ledger_entry missing');
    else console.log('apply_ledger_entry=ok');

    const rating = await client.query(
      `SELECT column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'rating'`,
    );
    if (rating.rowCount !== 1) failures.push('users.rating missing');
    else console.log(`users.rating default=${rating.rows[0].column_default}`);

    const rls = await client.query(
      `SELECT c.relname, c.relrowsecurity
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname IN ('wallets', 'ledger', 'matches', 'users')
       ORDER BY c.relname`,
    );
    for (const row of rls.rows) {
      console.log(`rls ${row.relname}=${row.relrowsecurity}`);
      if (row.relrowsecurity !== true) failures.push(`RLS off on ${row.relname}`);
    }

    const grants = await client.query(
      `SELECT grantee, privilege_type
       FROM information_schema.role_table_grants
       WHERE table_schema = 'public'
         AND table_name = 'wallets'
         AND grantee IN ('anon', 'authenticated', 'public')`,
    );
    if (grants.rowCount > 0) {
      failures.push(`wallets still granted to ${grants.rows.map((r) => r.grantee).join(',')}`);
    } else {
      console.log('wallets grants anon/authenticated/public=none');
    }
  } finally {
    await client.end();
  }

  if (failures.length) {
    console.error('[verify] FAILED');
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log('[verify] Phase 2 schema checks passed');
}

main().catch((err) => {
  const message = err && err.message ? err.message : String(err);
  console.error('[verify] failed:', message);
  if (err && err.code) console.error('[verify] code:', err.code);
  process.exit(1);
});
