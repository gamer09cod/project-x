'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { loadDb, makePool, makeClient } = require('./helpers/load-db');

const PG_ENV = ['PG_HOST', 'PG_PORT', 'PG_DATABASE', 'PG_USER', 'PG_PASSWORD'];

describe('db.js', () => {
  const saved = {};

  beforeEach(() => {
    for (const key of PG_ENV) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of PG_ENV) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  describe('getPool', () => {
    it('reads PG_* from process.env and defaults port 5432', () => {
      process.env.PG_HOST = 'db.example.supabase.co';
      process.env.PG_DATABASE = 'postgres';
      process.env.PG_USER = 'postgres';
      process.env.PG_PASSWORD = 'secret';

      const { pool, PoolImpl } = makePool(makeClient());
      const { getPool } = loadDb({ PoolImpl });
      getPool();

      assert.equal(pool.ctorOpts.host, 'db.example.supabase.co');
      assert.equal(pool.ctorOpts.port, 5432);
      assert.equal(pool.ctorOpts.database, 'postgres');
      assert.equal(pool.ctorOpts.user, 'postgres');
      assert.equal(pool.ctorOpts.password, 'secret');
      assert.equal(pool.ctorOpts.max, 2);
      assert.deepEqual(pool.ctorOpts.ssl, { rejectUnauthorized: false });
    });

    it('parses PG_PORT and enables SSL when host is set', () => {
      process.env.PG_HOST = '127.0.0.1';
      process.env.PG_PORT = '6543';
      const { pool, PoolImpl } = makePool(makeClient());
      const { getPool } = loadDb({ PoolImpl });
      getPool();
      assert.equal(pool.ctorOpts.port, 6543);
      assert.deepEqual(pool.ctorOpts.ssl, { rejectUnauthorized: false });
    });

    it('disables SSL when host is missing', () => {
      const { pool, PoolImpl } = makePool(makeClient());
      const { getPool } = loadDb({ PoolImpl });
      getPool();
      assert.equal(pool.ctorOpts.ssl, false);
    });

    it('falls back to functions.config().pg when env is empty', () => {
      const { pool, PoolImpl } = makePool(makeClient());
      const { getPool } = loadDb({
        PoolImpl,
        functionsConfig: { pg: { host: 'legacy.example', user: 'legacy-user' } },
      });
      getPool();
      assert.equal(pool.ctorOpts.host, 'legacy.example');
      assert.equal(pool.ctorOpts.user, 'legacy-user');
    });

    it('ignores a throwing functions.config() and still uses env', () => {
      process.env.PG_HOST = 'from-env.example';
      const { pool, PoolImpl } = makePool(makeClient());
      const { getPool } = loadDb({ PoolImpl, functionsConfig: 'throw' });
      getPool();
      assert.equal(pool.ctorOpts.host, 'from-env.example');
    });

    it('returns the same pool instance', () => {
      const { pool, PoolImpl } = makePool(makeClient());
      const { getPool } = loadDb({ PoolImpl });
      assert.equal(getPool(), pool);
      assert.equal(getPool(), pool);
    });
  });

  describe('query', () => {
    it('runs a parameterised statement and releases the client', async () => {
      const client = makeClient({
        query: mock.fn(async (text, params) => ({
          rows: [{ id: params[0] }],
          rowCount: 1,
        })),
        release: mock.fn(),
      });
      const { PoolImpl } = makePool(client);
      const { query } = loadDb({ PoolImpl });

      const result = await query('SELECT * FROM users WHERE id = $1', ['u-1']);

      assert.equal(client.query.mock.calls[0].arguments[0], 'SELECT * FROM users WHERE id = $1');
      assert.deepEqual(client.query.mock.calls[0].arguments[1], ['u-1']);
      assert.deepEqual(result.rows, [{ id: 'u-1' }]);
      assert.equal(client.release.mock.callCount(), 1);
    });

    it('releases the client when the statement throws', async () => {
      const client = makeClient({
        query: async () => {
          throw new Error('syntax error');
        },
        release: mock.fn(),
      });
      const { PoolImpl } = makePool(client);
      const { query } = loadDb({ PoolImpl });

      await assert.rejects(() => query('SELECT bad', []), /syntax error/);
      assert.equal(client.release.mock.callCount(), 1);
    });

    it('retries a transient acquire error then succeeds', async () => {
      const client = makeClient({
        query: async () => ({ rows: [{ ok: true }], rowCount: 1 }),
        release: mock.fn(),
      });
      const { pool, PoolImpl } = makePool(client);
      let attempts = 0;
      pool.connect = async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('too many clients');
        return client;
      };
      const { query } = loadDb({ PoolImpl });

      const result = await query('SELECT 1', []);
      assert.equal(attempts, 2);
      assert.deepEqual(result.rows, [{ ok: true }]);
    });

    it('does not retry a non-transient acquire error', async () => {
      const { pool, PoolImpl } = makePool(makeClient());
      pool.connect = async () => {
        throw new Error('password authentication failed');
      };
      const { query } = loadDb({ PoolImpl });
      await assert.rejects(() => query('SELECT 1', []), /password authentication failed/);
    });
  });

  describe('transaction', () => {
    it('BEGIN + SET LOCAL, callback, COMMIT, returns the callback value', async () => {
      const sql = [];
      const client = makeClient({
        query: mock.fn(async (text) => {
          sql.push(String(text));
          return { rows: [], rowCount: 0 };
        }),
        release: mock.fn(),
        on: mock.fn(),
        removeListener: mock.fn(),
      });
      const { PoolImpl } = makePool(client);
      const { transaction } = loadDb({ PoolImpl });

      const out = await transaction(async (c) => {
        assert.equal(c, client);
        await c.query('SELECT * FROM wallets WHERE user_id = $1', ['u-1']);
        return { matchId: 'm-1' };
      });

      assert.deepEqual(out, { matchId: 'm-1' });
      assert.match(sql[0], /BEGIN;/);
      assert.match(sql[0], /SET LOCAL statement_timeout = '25s'/);
      assert.match(sql[0], /SET LOCAL idle_in_transaction_session_timeout = '10s'/);
      assert.match(sql[0], /SET LOCAL lock_timeout = '5s'/);
      assert.match(sql[0], /SET LOCAL transaction_timeout = '30s'/);
      assert.equal(sql[1], 'SELECT * FROM wallets WHERE user_id = $1');
      assert.equal(sql.at(-1), 'COMMIT');
      assert.equal(client.release.mock.callCount(), 1);
      assert.equal(client.release.mock.calls[0].arguments[0], undefined);
      assert.equal(client.on.mock.calls[0].arguments[0], 'error');
      assert.equal(client.removeListener.mock.calls[0].arguments[0], 'error');
    });

    it('ROLLBACK and rethrows when the callback fails', async () => {
      const sql = [];
      const client = makeClient({
        query: async (text) => {
          sql.push(String(text));
          return { rows: [], rowCount: 0 };
        },
        release: mock.fn(),
        on() {},
        removeListener: mock.fn(),
      });
      const { PoolImpl } = makePool(client);
      const { transaction } = loadDb({ PoolImpl });

      await assert.rejects(
        () =>
          transaction(async () => {
            throw new Error('insufficient_funds');
          }),
        /insufficient_funds/,
      );
      assert.equal(sql.at(-1), 'ROLLBACK');
      assert.ok(!sql.includes('COMMIT'));
      assert.equal(client.release.mock.callCount(), 1);
    });

    it('keeps the original error if ROLLBACK itself fails', async () => {
      const client = makeClient({
        query: async (text) => {
          if (String(text) === 'ROLLBACK') throw new Error('connection terminated');
          return { rows: [], rowCount: 0 };
        },
        release: mock.fn(),
        on() {},
        removeListener() {},
      });
      const { PoolImpl } = makePool(client);
      const { transaction } = loadDb({ PoolImpl });

      await assert.rejects(
        () =>
          transaction(async () => {
            throw new Error('constraint violation');
          }),
        /constraint violation/,
      );
    });

    it('destroys the client when a session error fires mid-transaction', async () => {
      let onError;
      const client = makeClient({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: mock.fn(),
        on: (ev, fn) => {
          if (ev === 'error') onError = fn;
        },
        removeListener: mock.fn(),
      });
      const { PoolImpl } = makePool(client);
      const { transaction } = loadDb({ PoolImpl });

      const fatal = new Error('session terminated');
      await transaction(async () => {
        onError(fatal);
        return true;
      });

      assert.equal(client.release.mock.calls[0].arguments[0], fatal);
    });
  });
});
