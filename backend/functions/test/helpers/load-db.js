'use strict';

const Module = require('module');
const path = require('path');

const DB_PATH = path.resolve(__dirname, '../../src/db.js');
const originalLoad = Module._load;

/**
 * Load src/db.js with pg + firebase-functions replaced.
 * Call once per test so the pool singleton is fresh.
 */
function loadDb({ PoolImpl, functionsConfig } = {}) {
  delete require.cache[DB_PATH];

  Module._load = function intercept(request, parent, isMain) {
    if (request === 'pg') {
      return { Pool: PoolImpl };
    }
    if (request === 'firebase-functions') {
      return {
        config() {
          if (functionsConfig === 'throw') {
            throw new Error('no runtime config');
          }
          return functionsConfig || {};
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(DB_PATH);
  } finally {
    Module._load = originalLoad;
  }
}

function makePool(client) {
  const pool = {
    ctorOpts: null,
    connect: async () => client,
    on() {},
  };
  function PoolImpl(opts) {
    pool.ctorOpts = opts;
    return pool;
  }
  return { pool, PoolImpl };
}

function makeClient(overrides = {}) {
  return {
    query: async () => ({ rows: [], rowCount: 0 }),
    release() {},
    on() {},
    removeListener() {},
    ...overrides,
  };
}

module.exports = { loadDb, makePool, makeClient };
