import type {
  IsoTimestamp,
  JoinMatchResponse,
  ScorePayload,
  ScorePayloadBridgeMessage,
  StartRunMessage,
  Uuid,
} from '@project-x/shared';
import {
  BRIDGE_MESSAGE_VERSION,
  GAME_ID_BASKETBALL_V1,
  RUN_DURATION_MS,
} from '@project-x/shared';
import {UNITY_BRIDGE_HOST, UNITY_BRIDGE_METHOD} from './ping';

export type StartRunConfig = {
  matchId: Uuid;
  clientRunId: Uuid;
  seat: JoinMatchResponse['seat'];
  stakeCents: JoinMatchResponse['stakeCents'];
  opponentPostedScore: number | null;
  scoreDeadlineAt: IsoTimestamp;
  mode?: StartRunMessage['mode'];
  gameId?: StartRunMessage['gameId'];
  runDurationMs?: number;
  serverNowEpochMs: number;
  gameStartEpochMs: number;
  gameEndEpochMs: number;
};

export function makeStartRun(config: StartRunConfig): StartRunMessage {
  return {
    v: BRIDGE_MESSAGE_VERSION,
    type: 'startRun',
    matchId: config.matchId,
    clientRunId: config.clientRunId,
    gameId: config.gameId ?? GAME_ID_BASKETBALL_V1,
    mode: config.mode ?? 'pvp_1v1',
    seat: config.seat,
    stakeCents: config.stakeCents,
    opponentPostedScore: config.opponentPostedScore,
    scoreDeadlineAt: config.scoreDeadlineAt,
    runDurationMs: config.runDurationMs ?? RUN_DURATION_MS,
    serverNowEpochMs: config.serverNowEpochMs,
    gameStartEpochMs: config.gameStartEpochMs,
    gameEndEpochMs: config.gameEndEpochMs,
  };
}

export type ParsedUnityMessage =
  | {kind: 'runReady'; clientRunId: string}
  | {kind: 'scorePayload'; payload: ScorePayload; rawEnvelope: string}
  | {kind: 'pong'; nonce: string; unityBuildId: string}
  | {kind: 'unknown'; raw: string};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseUnityMessage(raw: string): ParsedUnityMessage {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed) || parsed.v !== BRIDGE_MESSAGE_VERSION) {
      return {kind: 'unknown', raw};
    }
    const type = parsed.type;
    if (type === 'runReady') {
      const clientRunId = parsed.clientRunId;
      if (typeof clientRunId !== 'string') {
        return {kind: 'unknown', raw};
      }
      return {kind: 'runReady', clientRunId};
    }
    if (type === 'scorePayload') {
      const payload = parsed.payload;
      if (!isObject(payload) || payload.schemaVersion !== 1) {
        return {kind: 'unknown', raw};
      }
      // Forward the nested payload object as-is (no field rewrite).
      return {
        kind: 'scorePayload',
        payload: payload as ScorePayload,
        rawEnvelope: raw,
      };
    }
    if (type === 'pong') {
      const nonce = parsed.nonce;
      const unityBuildId = parsed.unityBuildId;
      if (typeof nonce !== 'string' || typeof unityBuildId !== 'string') {
        return {kind: 'unknown', raw};
      }
      return {kind: 'pong', nonce, unityBuildId};
    }
    return {kind: 'unknown', raw};
  } catch {
    return {kind: 'unknown', raw};
  }
}

/** Extract ScorePayloadV1 JSON object for submitScore (envelope stripped). */
export function scorePayloadFromBridge(
  msg: ScorePayloadBridgeMessage | {payload: ScorePayload},
): ScorePayload {
  return msg.payload;
}

type UnityPoster = {
  postMessage: (gameObject: string, methodName: string, message: string) => void;
};

export function postStartRun(view: UnityPoster, config: StartRunConfig): void {
  view.postMessage(
    UNITY_BRIDGE_HOST,
    UNITY_BRIDGE_METHOD,
    JSON.stringify(makeStartRun(config)),
  );
}

export function postAbortRun(
  view: UnityPoster,
  clientRunId?: Uuid,
): void {
  const body: {v: number; type: 'abortRun'; clientRunId?: string} = {
    v: BRIDGE_MESSAGE_VERSION,
    type: 'abortRun',
  };
  if (clientRunId) {
    body.clientRunId = clientRunId;
  }
  view.postMessage(
    UNITY_BRIDGE_HOST,
    UNITY_BRIDGE_METHOD,
    JSON.stringify(body),
  );
}

export function postPing(view: UnityPoster, nonce: string): void {
  view.postMessage(
    UNITY_BRIDGE_HOST,
    UNITY_BRIDGE_METHOD,
    JSON.stringify({v: BRIDGE_MESSAGE_VERSION, type: 'ping', nonce}),
  );
}
