/**
 * Domain error codes returned in HttpsError.details.code.
 * Firebase HttpsError.code is the matching google-rpc / functions code.
 */
export type CallableErrorCode =
  | "unauthenticated"
  | "app_check_invalid"
  | "invalid_argument"
  | "insufficient_funds"
  | "boost_unavailable"
  | "boost_expired"
  | "boost_not_found"
  | "boost_not_owned"
  | "boost_not_active"
  | "boost_already_consumed"
  | "boost_game_mismatch"
  | "boost_mode_mismatch"
  | "boost_wager_limit"
  | "boost_budget_exceeded"
  | "boost_player_limit"
  | "already_active_match"
  | "already_active_streak"
  | "streak_expired"
  | "match_not_found"
  | "not_a_participant"
  | "not_running"
  | "idempotency_conflict"
  | "user_suspended"
  | "unknown_schema_version"
  | "unknown_unity_build"
  | "self_match";

export type CallableErrorDetails = {
  code: CallableErrorCode;
  field?: string;
};

export type MutationAuth = {
  /** Firebase ID token — transport header, not JSON body. */
  idTokenRequired: true;
  /** App Check token — required on money callables (enforced fail-closed in Phase 9). */
  appCheckRequired: true;
};
