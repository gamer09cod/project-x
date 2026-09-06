/**
 * Mirrors PostgreSQL enums in backend/supabase/migrations/20260903120000_init.sql.
 * Runtime JS twin for Functions (no TS require): backend/functions/src/domain.js
 */

export type UserStatus = "active" | "suspended" | "banned";

export type LedgerEntryType =
  | "WAGER_DEBIT"
  | "STREAK_WAGER_DEBIT"
  | "WAGER_REFUND"
  | "DRAW_REFUND"
  | "MATCH_TIMEOUT_REFUND"
  | "PAYOUT_CREDIT"
  | "STREAK_PAYOUT_CREDIT"
  | "PROMO_BOOST"
  | "ADMIN_CREDIT"
  | "ADMIN_DEBIT";

export type MatchMode = "pvp_1v1" | "streak";

export type MatchStatus =
  | "pending"
  | "live"
  | "open"
  | "paired"
  | "settled"
  | "timeout_refunded"
  | "void";

export type MatchPlayerStatus =
  | "pending"
  | "running"
  | "scored"
  | "zeroed_timeout"
  | "settled";

export type MatchPlayerSeat = 1 | 2;

export type BoostType = "prize_boost";
export type BoostStatus = "available" | "consumed" | "expired";
export type StreakStatus = "active" | "won" | "lost" | "cashed_out";
