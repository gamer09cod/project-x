'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATIONS_DIR = path.join(ROOT, 'backend/supabase/migrations');
const ENV_FILE = path.join(ROOT, 'backend/functions/.env');

const FILES = [
  '20260903120000_init.sql',
  '20260903140000_player_rating.sql',
  '20260904120000_client_run_id.sql',
  '20260904180000_streak_three_legs.sql',
  '20260905120000_prize_boost_promo.sql',
  '20260906120000_streak_resume.sql',
];

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

/**
 * Split SQL text into individual statements on unquoted semicolons.
 * Correctly skips:
 *   - $dollar$ quoted blocks (PL/pgSQL function bodies)
 *   - 'single-quoted' string literals
 *   - "double-quoted" identifiers
 *   - -- line comments
 *   - /* block comments * /
 */
function splitStatements(sql) {
  const statements = [];
  let buf = '';
  let i = 0;
  const len = sql.length;

  while (i < len) {
    const ch = sql[i];

    // -- line comment: skip to end of line, keep newline in buf
    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      if (end === -1) { buf += sql.slice(i); i = len; }
      else { buf += sql.slice(i, end + 1); i = end + 1; }
      continue;
    }

    // /* block comment */
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) { buf += sql.slice(i); i = len; }
      else { buf += sql.slice(i, end + 2); i = end + 2; }
      continue;
    }

    // $tag$ dollar-quoted string
    if (ch === '$') {
      const dollarRe = /\$[A-Za-z0-9_]*\$/y;
      dollarRe.lastIndex = i;
      const m = dollarRe.exec(sql);
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        if (end === -1) throw new Error(`Unclosed dollar-quote ${tag}`);
        buf += sql.slice(i, end + tag.length);
        i = end + tag.length;
        continue;
      }
    }

    // 'single-quoted' string literal (handles '' escapes)
    if (ch === "'") {
      let j = i + 1;
      while (j < len) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j += 1; break; }
        j += 1;
      }
      buf += sql.slice(i, j);
      i = j;
      continue;
    }

    // "double-quoted" identifier
    if (ch === '"') {
      let j = i + 1;
      while (j < len) {
        if (sql[j] === '"' && sql[j + 1] === '"') { j += 2; continue; }
        if (sql[j] === '"') { j += 1; break; }
        j += 1;
      }
      buf += sql.slice(i, j);
      i = j;
      continue;
    }

    // semicolon — end of statement
    if (ch === ';') {
      const stmt = buf.trim();
      if (stmt.length) statements.push(stmt);
      buf = '';
      i += 1;
      continue;
    }

    buf += ch;
    i += 1;
  }

  const tail = buf.trim();
  if (tail.length) statements.push(tail);
  return statements;
}

async function applyFile(client, fileName) {
  const full = path.join(MIGRATIONS_DIR, fileName);
  const sql = fs.readFileSync(full, 'utf8');
  const statements = splitStatements(sql);
  console.log(`[apply] ${fileName} (${statements.length} statements)`);
  for (const stmt of statements) {
    await client.query(stmt);
  }
}

async function main() {
  loadDotEnv(ENV_FILE);
  const client = new Client(pgConfig());
  await client.connect();
  try {
    const { rows } = await client.query('SHOW server_version');
    console.log(`[apply] connected, server_version=${rows[0].server_version}`);
    for (const file of FILES) {
      await applyFile(client, file);
    }
    console.log('[apply] done');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  const message = err && err.message ? err.message : String(err);
  console.error('[apply] failed:', message);
  if (err && err.code) console.error('[apply] code:', err.code);
  if (err && err.detail) console.error('[apply] detail:', err.detail);
  if (err && err.hint) console.error('[apply] hint:', err.hint);
  if (err && Array.isArray(err.errors)) {
    for (const inner of err.errors) {
      console.error('[apply] cause:', inner && (inner.message || inner.code || inner));
    }
  }
  process.exit(1);
});
