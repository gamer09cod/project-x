export { JOIN_MATCH, joinMatchAuth } from "./join-match";
export type { JoinMatchRequest, JoinMatchResponse, GameTimerEpochs } from "./join-match";

export { LIST_BOOSTS, listBoostsAuth } from "./list-boosts";
export type {
  ListBoostsRequest,
  ListBoostsResponse,
  PlayerBoost,
} from "./list-boosts";

export {
  START_STREAK,
  CONTINUE_STREAK,
  ABANDON_STREAK,
  GET_ACTIVE_STREAK,
  STREAK_LEGS_TOTAL,
  STREAK_FALLBACK_TARGETS,
  startStreakAuth,
  continueStreakAuth,
  abandonStreakAuth,
  getActiveStreakAuth,
} from "./start-streak";
export type {
  StartStreakRequest,
  StartStreakResponse,
  ContinueStreakRequest,
  ContinueStreakResponse,
  AbandonStreakRequest,
  AbandonStreakResponse,
  StreakRunResponse,
  GetActiveStreakRequest,
  GetActiveStreakResponse,
  StreakSnapshot,
} from "./start-streak";

export { SUBMIT_SCORE, submitScoreAuth } from "./submit-score";
export type {
  MatchSettleResult,
  SubmitScoreRequest,
  SubmitScoreResponse,
} from "./submit-score";

export { ENSURE_PROFILE, ensureProfileAuth } from "./ensure-profile";
export type {
  EnsureProfileRequest,
  EnsureProfileResponse,
} from "./ensure-profile";

export { GET_WALLET, getWalletAuth } from "./get-wallet";
export type { GetWalletRequest, GetWalletResponse } from "./get-wallet";

export {
  MOCK_DEPOSIT,
  MOCK_DEPOSIT_MAX_CENTS,
  mockDepositAuth,
} from "./mock-deposit";
export type { MockDepositRequest, MockDepositResponse } from "./mock-deposit";

export type { CallableErrorCode, CallableErrorDetails, MutationAuth } from "./errors";
