import {httpsCallable} from '@react-native-firebase/functions';
import type {
  AbandonStreakRequest,
  AbandonStreakResponse,
  ContinueStreakRequest,
  ContinueStreakResponse,
  EnsureProfileRequest,
  EnsureProfileResponse,
  GetActiveStreakRequest,
  GetActiveStreakResponse,
  GetWalletResponse,
  JoinMatchRequest,
  JoinMatchResponse,
  ListBoostsResponse,
  MockDepositRequest,
  MockDepositResponse,
  StartStreakRequest,
  StartStreakResponse,
  SubmitScoreRequest,
  SubmitScoreResponse,
} from '@project-x/shared';
import {
  ABANDON_STREAK,
  CONTINUE_STREAK,
  ENSURE_PROFILE,
  GET_ACTIVE_STREAK,
  GET_WALLET,
  JOIN_MATCH,
  LIST_BOOSTS,
  MOCK_DEPOSIT,
  START_STREAK,
  SUBMIT_SCORE,
} from '@project-x/shared';
import {appFunctions} from './firebase';

async function call<TReq extends object | undefined, TRes>(
  name: string,
  data?: TReq,
): Promise<TRes> {
  const callable = httpsCallable(appFunctions(), name);
  const result = await callable(data ?? {});
  return result.data as TRes;
}

export function ensureProfile(
  req: EnsureProfileRequest = {},
): Promise<EnsureProfileResponse> {
  return call(ENSURE_PROFILE, req);
}

export function getWallet(): Promise<GetWalletResponse> {
  return call(GET_WALLET, {});
}

export function mockDeposit(
  req: MockDepositRequest,
): Promise<MockDepositResponse> {
  return call(MOCK_DEPOSIT, req);
}

export function joinMatch(req: JoinMatchRequest): Promise<JoinMatchResponse> {
  return call(JOIN_MATCH, req);
}

export function listBoosts(): Promise<ListBoostsResponse> {
  return call(LIST_BOOSTS, {});
}

export function startStreak(
  req: StartStreakRequest,
): Promise<StartStreakResponse> {
  return call(START_STREAK, req);
}

export function continueStreak(
  req: ContinueStreakRequest,
): Promise<ContinueStreakResponse> {
  return call(CONTINUE_STREAK, req);
}

export function abandonStreak(
  req: AbandonStreakRequest,
): Promise<AbandonStreakResponse> {
  return call(ABANDON_STREAK, req);
}

export function getActiveStreak(
  req: GetActiveStreakRequest = {},
): Promise<GetActiveStreakResponse> {
  return call(GET_ACTIVE_STREAK, req);
}

export function submitScore(
  req: SubmitScoreRequest,
): Promise<SubmitScoreResponse> {
  return call(SUBMIT_SCORE, req);
}
