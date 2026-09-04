'use strict';

/**
 * Runtime mirrors of packages/shared/src/domain.ts (Postgres enums).
 * Functions are JavaScript — do not require TypeScript sources.
 * Keep labels in lockstep with domain.ts + 20260903120000_init.sql.
 */

const USER_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  BANNED: 'banned',
});

const LEDGER_ENTRY_TYPE = Object.freeze({
  WAGER_DEBIT: 'WAGER_DEBIT',
  STREAK_WAGER_DEBIT: 'STREAK_WAGER_DEBIT',
  WAGER_REFUND: 'WAGER_REFUND',
  DRAW_REFUND: 'DRAW_REFUND',
  MATCH_TIMEOUT_REFUND: 'MATCH_TIMEOUT_REFUND',
  PAYOUT_CREDIT: 'PAYOUT_CREDIT',
  STREAK_PAYOUT_CREDIT: 'STREAK_PAYOUT_CREDIT',
  ADMIN_CREDIT: 'ADMIN_CREDIT',
  ADMIN_DEBIT: 'ADMIN_DEBIT',
});

const MATCH_MODE = Object.freeze({
  PVP_1V1: 'pvp_1v1',
  STREAK: 'streak',
});

const MATCH_STATUS = Object.freeze({
  PENDING: 'pending',
  LIVE: 'live',
  OPEN: 'open',
  PAIRED: 'paired',
  SETTLED: 'settled',
  TIMEOUT_REFUNDED: 'timeout_refunded',
  VOID: 'void',
});

const MATCH_PLAYER_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  SCORED: 'scored',
  ZEROED_TIMEOUT: 'zeroed_timeout',
  SETTLED: 'settled',
});

const BOOST_STATUS = Object.freeze({
  AVAILABLE: 'available',
  CONSUMED: 'consumed',
  EXPIRED: 'expired',
});

const STREAK_STATUS = Object.freeze({
  ACTIVE: 'active',
  WON: 'won',
  LOST: 'lost',
  CASHED_OUT: 'cashed_out',
});

module.exports = {
  USER_STATUS,
  LEDGER_ENTRY_TYPE,
  MATCH_MODE,
  MATCH_STATUS,
  MATCH_PLAYER_STATUS,
  BOOST_STATUS,
  STREAK_STATUS,
};
