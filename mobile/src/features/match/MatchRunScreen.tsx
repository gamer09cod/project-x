import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  Cents,
  IsoTimestamp,
  MatchPlayerSeat,
  ScorePayload,
  SubmitScoreResponse,
  Uuid,
} from '@project-x/shared';
import {useUnityPlayer} from '../embed/UnityPlayerHost';
import {
  parseUnityMessage,
  postAbortRun,
  postPing,
  postStartRun,
} from '../../bridge/run';
import {newIdempotencyKey} from '../../lib/idempotency';
import {abandonStreak, submitScore} from '../../services/callables';
import {mapCallableError} from '../../lib/callableErrors';

/** Minimal run session — works for joinMatch or startStreak PvE. */
export type MatchRunParams = {
  matchId: Uuid;
  seat: MatchPlayerSeat;
  stakeCents: Cents;
  scoreDeadlineAt: IsoTimestamp;
  opponentPostedScore: number | null;
  clientRunId: Uuid;
  streakId?: Uuid;
  currentLeg?: 1 | 2 | 3;
  targetScore?: number;
  targetScores?: [number, number, number];
  expiresAt?: IsoTimestamp;
};

type Props = {
  params: MatchRunParams;
  onFinished: (result: {
    submit: SubmitScoreResponse;
    payload: ScorePayload;
  }) => void;
  onCancel: () => void;
};

const HANDSHAKE_TICK_MS = 450;
const HANDSHAKE_TIMEOUT_MS = 15000;
/** Let a cold or re-shown surface settle before postMessage. */
const COLD_START_MS = 600;

/**
 * Money-safe: only shown after join succeeds.
 * Uses session UnityPlayerHost — does not mount/unmount UnityView (Phase B).
 */
export function MatchRunScreen({
  params,
  onFinished,
  onCancel,
}: Props): React.JSX.Element {
  const {unityRef, setMessageHandler, pause} = useUnityPlayer();
  const submitKeyRef = useRef(newIdempotencyKey());
  const runReadyRef = useRef(false);
  const bridgeUpRef = useRef(false);
  const coldReadyRef = useRef(false);
  const submittingRef = useRef(false);
  const abortedRef = useRef(false);
  const runCompleteRef = useRef(false);
  const [status, setStatus] = useState('Waiting for Unity…');
  const [busy, setBusy] = useState(false);
  const [runComplete, setRunComplete] = useState(false);
  const [pendingScore, setPendingScore] = useState<number | null>(null);

  const abortUnity = useCallback(() => {
    if (abortedRef.current) {
      return;
    }
    abortedRef.current = true;
    const view = unityRef.current;
    if (view) {
      try {
        postAbortRun(view, params.clientRunId);
      } catch {
        // ignore
      }
    }
  }, [params.clientRunId, unityRef]);

  const leave = useCallback(async () => {
    abortUnity();
    pause();
    if (params.streakId) {
      setBusy(true);
      setStatus('Quitting streak…');
      try {
        await abandonStreak({
          streakId: params.streakId,
          idempotencyKey: newIdempotencyKey() as Uuid,
        });
      } catch (e) {
        setBusy(false);
        setStatus(mapCallableError(e).message);
        return;
      }
    }
    onCancel();
  }, [abortUnity, onCancel, params.streakId, pause]);

  useEffect(() => {
    abortedRef.current = false;
    runReadyRef.current = false;
    bridgeUpRef.current = false;
    coldReadyRef.current = false;
    submittingRef.current = false;
    runCompleteRef.current = false;
    setRunComplete(false);
    setPendingScore(null);
    setBusy(false);
    setStatus('Waiting for Unity…');

    const matchId = params.matchId;
    const clientRunId = params.clientRunId;

    const cold = setTimeout(() => {
      coldReadyRef.current = true;
      setStatus('Bridging…');
    }, COLD_START_MS);

    setMessageHandler(raw => {
      const msg = parseUnityMessage(raw);
      if (msg.kind === 'pong') {
        bridgeUpRef.current = true;
        if (!runReadyRef.current) {
          setStatus(`Unity up · ${msg.unityBuildId}`);
        }
        return;
      }
      if (msg.kind === 'runReady') {
        if (msg.clientRunId !== clientRunId) {
          setStatus(`runReady mismatch · ${msg.clientRunId}`);
          return;
        }
        runReadyRef.current = true;
        setStatus('Run ready · play until the clock ends');
        return;
      }
      if (msg.kind === 'scorePayload') {
        if (msg.payload.clientRunId !== clientRunId) {
          setStatus('scorePayload clientRunId mismatch — ignored');
          return;
        }
        void (async () => {
          if (submittingRef.current) {
            return;
          }
          submittingRef.current = true;
          runCompleteRef.current = true;
          pause();
          setRunComplete(true);
          setPendingScore(msg.payload.score);
          setBusy(true);
          setStatus('Submitting score…');
          try {
            const submit = await submitScore({
              matchId,
              scorePayload: msg.payload,
              idempotencyKey: submitKeyRef.current as Uuid,
            });
            onFinished({submit, payload: msg.payload});
          } catch (e) {
            submittingRef.current = false;
            const err = e instanceof Error ? e.message : String(e);
            setStatus(`submitScore failed: ${err}`);
            setBusy(false);
          }
        })();
        return;
      }
      setStatus(`Unity: ${raw.slice(0, 120)}`);
    });

    return () => {
      clearTimeout(cold);
      setMessageHandler(null);
      abortUnity();
      pause();
    };
  }, [
    abortUnity,
    onFinished,
    params.clientRunId,
    params.matchId,
    pause,
    setMessageHandler,
  ]);

  useEffect(() => {
    if (runComplete) {
      return;
    }
    const startedAt = Date.now();

    const tick = () => {
      if (
        runReadyRef.current ||
        abortedRef.current ||
        runCompleteRef.current
      ) {
        return;
      }
      const view = unityRef.current;
      if (!view) {
        setStatus('Unity player not ready — retrying…');
        return;
      }
      if (Date.now() - startedAt > HANDSHAKE_TIMEOUT_MS) {
        setStatus(
          'Unity failed to launch. Leave and retry (server may zero after 75s).',
        );
        return;
      }
      if (!coldReadyRef.current) {
        setStatus('Waiting for graphics…');
        return;
      }
      if (!bridgeUpRef.current) {
        postPing(view, `run-${params.clientRunId.slice(0, 8)}-${Date.now()}`);
        setStatus('Pinging Unity…');
        return;
      }
      postStartRun(view, {
        matchId: params.matchId,
        clientRunId: params.clientRunId,
        seat: params.seat,
        stakeCents: params.stakeCents,
        opponentPostedScore: params.opponentPostedScore,
        scoreDeadlineAt: params.scoreDeadlineAt,
      });
      setStatus('startRun sent · waiting for runReady…');
    };

    const interval = setInterval(tick, HANDSHAKE_TICK_MS);
    tick();
    return () => clearInterval(interval);
  }, [params, runComplete, unityRef]);

  return (
    <View style={styles.root} pointerEvents="box-none">
      {!runComplete ? (
        <View style={styles.hud} pointerEvents="box-none">
          <Text style={styles.hudTitle}>
            {params.streakId
              ? `Streak · game ${params.currentLeg ?? 1}/3`
              : 'Match run'}
          </Text>
          {params.targetScore != null ? (
            <Text style={styles.hudLine}>Beat {params.targetScore}</Text>
          ) : null}
          <Text style={styles.hudLine}>
            seat {params.seat} · stake {params.stakeCents}¢ · match{' '}
            {params.matchId.slice(0, 8)}…
          </Text>
          {params.opponentPostedScore != null ? (
            <Text style={styles.hudLine}>
              Opponent posted: {params.opponentPostedScore}
            </Text>
          ) : null}
          <Text style={styles.hudLine}>{status}</Text>
          <Pressable
            style={styles.back}
            onPress={() => {
              void leave();
            }}
            disabled={busy}>
            <Text style={styles.buttonLabel}>
              {params.streakId
                ? 'Quit streak (no refund)'
                : 'Leave (server may zero)'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.handoffOverlay}>
          <Text style={styles.handoffTitle}>Run complete</Text>
          {pendingScore != null ? (
            <Text style={styles.handoffLine}>Claimed score {pendingScore}</Text>
          ) : null}
          <Text style={styles.handoffLine}>{status}</Text>
          {busy ? <ActivityIndicator color="#9ec5ff" /> : null}
          {!busy ? (
            <Pressable
              style={styles.back}
              onPress={() => {
                void leave();
              }}>
              <Text style={styles.buttonLabel}>Back to wallet</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  handoffOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0b1420',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  handoffTitle: {
    color: '#f4f7fb',
    fontSize: 24,
    fontWeight: '700',
  },
  handoffLine: {
    color: '#c5d0dc',
    fontSize: 16,
  },
  hud: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 28,
    gap: 6,
  },
  hudTitle: {
    color: '#f4f7fb',
    fontSize: 18,
    fontWeight: '600',
  },
  hudLine: {
    color: '#c5d0dc',
    fontSize: 13,
  },
  back: {
    alignSelf: 'flex-start',
    backgroundColor: '#243447',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  buttonLabel: {
    color: '#fff',
    fontWeight: '600',
  },
});
