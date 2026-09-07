import React, {useCallback, useEffect, useState} from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';
import type {
  Cents,
  ScorePayload,
  StreakRunResponse,
  StreakSnapshot,
  SubmitScoreResponse,
  Uuid,
} from '@project-x/shared';
import {STREAK_FALLBACK_TARGETS} from '@project-x/shared';
import {colors} from '../theme';
import {ScreenSafe} from '../components/ScreenSafe';
import {TopBarHeader} from '../components/TopBarHeader';
import {BottomTabBar, type TabId} from '../components/BottomTabBar';
import {newIdempotencyKey} from '../lib/idempotency';
import {
  abandonStreak,
  continueStreak,
  ensureProfile,
  getActiveStreak,
  getWallet,
} from '../services/callables';
import {mapCallableError} from '../lib/callableErrors';
import {BoostScreen} from '../features/boost/BoostScreen';
import {LeaguesScreen} from '../features/leagues/LeaguesScreen';
import {PlayScreen} from '../features/play/PlayScreen';
import {
  snapshotFromStreakRun,
  snapshotFromSubmit,
} from '../features/play/streakSnapshot';
import {MatchmakingScreen} from '../features/matchmaking/MatchmakingScreen';
import {ResultsTabScreen} from '../features/results/ResultsTabScreen';
import {prependResult, type ResultEntry} from '../features/results/resultHistory';
import {MatchResultScreen} from '../features/match/MatchResultScreen';
import {
  MatchRunScreen,
  type MatchRunParams,
} from '../features/match/MatchRunScreen';
import {ProfileScreen} from '../features/profile/ProfileScreen';
import {UnityPlayerHost} from '../features/embed/UnityPlayerHost';

type Overlay =
  | {name: 'none'}
  | {
      name: 'matchmaking';
      mode: 'pvp_1v1' | 'streak';
      stakeCents: Cents;
      idempotencyKey: string;
    }
  | {name: 'run'; params: MatchRunParams}
  | {name: 'result'; submit: SubmitScoreResponse; payload: ScorePayload};

export function AppShell(): React.JSX.Element {
  const [tab, setTab] = useState<TabId>('play');
  const [overlay, setOverlay] = useState<Overlay>({name: 'none'});
  /** Keep Unity mounted after first join until AppShell unmounts (sign-out). */
  const [unitySession, setUnitySession] = useState(false);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [activatedBoostId, setActivatedBoostId] = useState<string | null>(null);
  const [boostInventoryCount, setBoostInventoryCount] = useState(0);
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [activeStreak, setActiveStreak] = useState<StreakSnapshot | null>(null);
  const [previewTargets, setPreviewTargets] = useState<
    [number, number, number]
  >([
    STREAK_FALLBACK_TARGETS[0],
    STREAK_FALLBACK_TARGETS[1],
    STREAK_FALLBACK_TARGETS[2],
  ]);
  const [streakLoadError, setStreakLoadError] = useState<string | null>(null);
  const [streakBusy, setStreakBusy] = useState(false);

  const onInventoryCount = useCallback((count: number) => {
    setBoostInventoryCount(count);
  }, []);

  const refreshWallet = useCallback(async () => {
    try {
      await ensureProfile({});
      const w = await getWallet();
      setBalanceCents(w.balanceCents);
      setRating(w.rating);
    } catch {
      // Profile tab still shows the detailed error.
    }
  }, []);

  const refreshStreak = useCallback(async () => {
    try {
      const res = await getActiveStreak();
      if (res.previewTargets && res.previewTargets.length === 3) {
        setPreviewTargets(res.previewTargets);
      }
      setActiveStreak(prev => {
        if (res.streak) {
          return res.streak;
        }
        if (prev && prev.streakStatus === 'active') {
          return prev;
        }
        return res.streak;
      });
      setStreakLoadError(null);
      if (res.streak?.walletBalanceCents != null) {
        setBalanceCents(res.streak.walletBalanceCents);
      }
    } catch (e) {
      setStreakLoadError(mapCallableError(e).message);
    }
  }, []);

  useEffect(() => {
    refreshWallet();
    refreshStreak();
  }, [refreshWallet, refreshStreak]);

  const goTabs = () => {
    setOverlay({name: 'none'});
    refreshWallet();
    refreshStreak();
  };

  const enterRun = useCallback((params: MatchRunParams) => {
    setUnitySession(true);
    setOverlay({name: 'run', params});
  }, []);

  const runFromStreak = (args: {
    matchId: Uuid;
    stakeCents: Cents;
    scoreDeadlineAt: string;
    streakId: Uuid;
    currentLeg?: 1 | 2 | 3;
    targetScore?: number;
    targetScores?: [number, number, number];
    expiresAt?: string;
  }) => {
    enterRun({
      matchId: args.matchId,
      seat: 1,
      stakeCents: args.stakeCents,
      scoreDeadlineAt: args.scoreDeadlineAt as MatchRunParams['scoreDeadlineAt'],
      opponentPostedScore: null,
      clientRunId: newIdempotencyKey() as Uuid,
      streakId: args.streakId,
      currentLeg: args.currentLeg,
      targetScore: args.targetScore,
      targetScores: args.targetScores,
      expiresAt: args.expiresAt as MatchRunParams['expiresAt'],
    });
  };

  const recordResult = (submit: SubmitScoreResponse, payload: ScorePayload) => {
    setResults(prev =>
      prependResult(prev, {submit, payload, recordedAtMs: Date.now()}),
    );
    if ('walletBalanceCents' in submit) {
      setBalanceCents(submit.walletBalanceCents);
    }
    setActiveStreak(prev => snapshotFromSubmit(submit, prev));
    setOverlay({name: 'result', submit, payload});
  };

  let body: React.ReactNode;
  if (overlay.name === 'run') {
    body = (
      <MatchRunScreen
        params={overlay.params}
        onCancel={goTabs}
        onFinished={({submit, payload}) => recordResult(submit, payload)}
      />
    );
  } else if (overlay.name === 'result') {
    body = (
      <ScreenSafe style={styles.root} edges={['top']}>
        <StatusBar barStyle="light-content" />
        <MatchResultScreen
          submit={overlay.submit}
          payload={overlay.payload}
          onDone={() => {
            setTab('results');
            goTabs();
          }}
          onContinueStreak={params => enterRun(params)}
        />
      </ScreenSafe>
    );
  } else if (overlay.name === 'matchmaking') {
    body = (
      <ScreenSafe style={styles.root} edges={['top']}>
        <StatusBar barStyle="light-content" />
        <MatchmakingScreen
          mode={overlay.mode}
          stakeCents={overlay.stakeCents}
          idempotencyKey={overlay.idempotencyKey}
          boostPreview={activatedBoostId != null && overlay.mode === 'pvp_1v1'}
          boostId={
            overlay.mode === 'pvp_1v1' ? (activatedBoostId as Uuid | null) : null
          }
          onFailedBack={() => setOverlay({name: 'none'})}
          onJoined={(
            params,
            walletBalanceCents,
            streakRun?: StreakRunResponse,
          ) => {
            setBalanceCents(walletBalanceCents);
            if (streakRun) {
              setActiveStreak(prev => snapshotFromStreakRun(streakRun, prev));
            }
            if (overlay.mode === 'pvp_1v1') {
              setActivatedBoostId(null);
            }
            enterRun(params);
          }}
        />
      </ScreenSafe>
    );
  } else {
    body = (
      <ScreenSafe style={styles.root} edges={['top']}>
        <StatusBar barStyle="light-content" />
        {tab !== 'profile' ? (
          <TopBarHeader
            balanceCents={balanceCents}
            rating={rating}
            onDeposit={() => setTab('profile')}
          />
        ) : null}
        <View style={styles.body}>
          {tab === 'results' ? (
            <ResultsTabScreen
              entries={results}
              onOpen={entry =>
                setOverlay({
                  name: 'result',
                  submit: entry.submit,
                  payload: entry.payload,
                })
              }
            />
          ) : null}
          {tab === 'leagues' ? <LeaguesScreen /> : null}
          {tab === 'play' ? (
            <PlayScreen
              boostActive={activatedBoostId != null}
              activeStreak={activeStreak}
              previewTargets={previewTargets}
              streakLoadError={streakLoadError}
              streakBusy={streakBusy}
              onPlay={({mode, stakeCents}) =>
                setOverlay({
                  name: 'matchmaking',
                  mode,
                  stakeCents,
                  idempotencyKey: newIdempotencyKey(),
                })
              }
              onResumeStreak={() => {
                if (
                  !activeStreak?.canResumeRun ||
                  !activeStreak.pveMatchId ||
                  !activeStreak.scoreDeadlineAt
                ) {
                  return;
                }
                runFromStreak({
                  matchId: activeStreak.pveMatchId,
                  stakeCents: activeStreak.stakeCents,
                  scoreDeadlineAt: activeStreak.scoreDeadlineAt,
                  streakId: activeStreak.streakId,
                  currentLeg: activeStreak.currentLeg,
                  targetScore:
                    activeStreak.targetScores[activeStreak.currentLeg - 1],
                  targetScores: activeStreak.targetScores,
                  expiresAt: activeStreak.expiresAt,
                });
              }}
              onContinueStreak={() => {
                if (!activeStreak?.canContinue) {
                  return;
                }
                setStreakBusy(true);
                void continueStreak({
                  streakId: activeStreak.streakId,
                  idempotencyKey: newIdempotencyKey() as Uuid,
                })
                  .then(next => {
                    setActiveStreak(prev => snapshotFromStreakRun(next, prev));
                    runFromStreak({
                      matchId: next.pveMatchId,
                      stakeCents: next.stakeCents,
                      scoreDeadlineAt: next.scoreDeadlineAt,
                      streakId: next.streakId,
                      currentLeg: next.currentLeg,
                      targetScore: next.targetScore,
                      targetScores: next.targetScores,
                      expiresAt: next.expiresAt,
                    });
                  })
                  .catch(e => {
                    setStreakLoadError(mapCallableError(e).message);
                  })
                  .finally(() => {
                    setStreakBusy(false);
                  });
              }}
              onAbandonStreak={() => {
                if (!activeStreak) {
                  return;
                }
                setStreakBusy(true);
                void abandonStreak({
                  streakId: activeStreak.streakId,
                  idempotencyKey: newIdempotencyKey() as Uuid,
                })
                  .then(res => {
                    setBalanceCents(res.walletBalanceCents);
                    setActiveStreak(null);
                  })
                  .catch(e => {
                    setStreakLoadError(mapCallableError(e).message);
                  })
                  .finally(() => {
                    setStreakBusy(false);
                    refreshStreak();
                  });
              }}
            />
          ) : null}
          {tab === 'boost' ? (
            <BoostScreen
              activatedId={activatedBoostId}
              onActivate={id =>
                setActivatedBoostId(prev => (prev === id ? null : id))
              }
              onInventoryCount={onInventoryCount}
            />
          ) : null}
          {tab === 'profile' ? (
            <ProfileScreen
              onWalletChange={(cents, nextRating) => {
                setBalanceCents(cents);
                setRating(nextRating);
              }}
            />
          ) : null}
        </View>
        <BottomTabBar
          active={tab}
          boostCount={boostInventoryCount}
          onChange={next => {
            setTab(next);
            if (next === 'profile' || next === 'play' || next === 'results') {
              refreshWallet();
            }
            if (next === 'play') {
              refreshStreak();
            }
          }}
        />
      </ScreenSafe>
    );
  }

  return (
    <UnityPlayerHost
      sessionActive={unitySession}
      visible={overlay.name === 'run'}>
      {body}
    </UnityPlayerHost>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  body: {flex: 1},
});
