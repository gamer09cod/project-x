import {httpsCallable} from '@react-native-firebase/functions';
import type {
  EnsureProfileRequest,
  EnsureProfileResponse,
  GetWalletResponse,
  JoinMatchRequest,
  JoinMatchResponse,
  MockDepositRequest,
  MockDepositResponse,
  SubmitScoreRequest,
  SubmitScoreResponse,
} from '@project-x/shared';
import {
  ENSURE_PROFILE,
  GET_WALLET,
  JOIN_MATCH,
  MOCK_DEPOSIT,
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

export function submitScore(
  req: SubmitScoreRequest,
): Promise<SubmitScoreResponse> {
  return call(SUBMIT_SCORE, req);
}
