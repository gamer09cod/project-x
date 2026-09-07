import type { Cents } from "./money";
import type { GameId, IsoTimestamp, Uuid } from "./ids";
import type { MatchMode, MatchPlayerSeat } from "./domain";
import type { ScorePayloadV1 } from "./score-payload";
import { RUN_DURATION_MS } from "./score-payload";

/** Bridge envelope version (ping/pong/startRun/scorePayload). */
export const BRIDGE_MESSAGE_VERSION = 1;

export type BridgeMessageVersion = typeof BRIDGE_MESSAGE_VERSION;

/**
 * RN → Unity after joinMatch / startStreak succeeds.
 * Unity must not start a scored run without this handshake.
 * Play clock: gameEndEpochMs is authoritative; remaining = end - estimatedServerNow.
 */
export type StartRunMessage = {
  v: BridgeMessageVersion;
  type: "startRun";
  matchId: Uuid;
  clientRunId: Uuid;
  gameId: GameId;
  mode: Extract<MatchMode, "pvp_1v1" | "streak">;
  seat: MatchPlayerSeat;
  /** Display only — Unity never pays out. */
  stakeCents: Cents;
  opponentPostedScore: number | null;
  /** Submit/crash-scum window (ISO). Not the play clock. */
  scoreDeadlineAt: IsoTimestamp;
  /** Display/debug duration; deadline epochs are authoritative. */
  runDurationMs: typeof RUN_DURATION_MS | number;
  serverNowEpochMs: number;
  gameStartEpochMs: number;
  gameEndEpochMs: number;
};

/** RN → Unity when leaving mid-run or remounting (no scorePayload). */
export type AbortRunMessage = {
  v: BridgeMessageVersion;
  type: "abortRun";
  clientRunId?: Uuid;
};

/** Unity → RN once startRun is accepted and the run can begin. */
export type RunReadyMessage = {
  v: BridgeMessageVersion;
  type: "runReady";
  clientRunId: Uuid;
};

/**
 * Unity → RN end of run. RN strips the envelope and forwards `payload`
 * to submitScore unchanged.
 */
export type ScorePayloadBridgeMessage = {
  v: BridgeMessageVersion;
  type: "scorePayload";
  payload: ScorePayloadV1;
};

export type RnToUnityMessage = StartRunMessage | AbortRunMessage;
export type UnityToRnMessage = RunReadyMessage | ScorePayloadBridgeMessage;
