import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {AppState, Platform, StyleSheet, View} from 'react-native';
import UnityView from '@azesmway/react-native-unity';
import {colors} from '../../theme';

type MessageHandler = (raw: string) => void;

type UnityPlayerContextValue = {
  unityRef: RefObject<UnityView | null>;
  setMessageHandler: (handler: MessageHandler | null) => void;
  pause: () => void;
  /**
   * Cover Unity with opaque RN chrome (post-score handoff).
   * Android SurfaceView draws above RN siblings — overlays alone leave a blank strip.
   */
  hideForHandoff: () => void;
};

const UnityPlayerContext = createContext<UnityPlayerContextValue | null>(null);

type Props = {
  sessionActive: boolean;
  visible: boolean;
  children: ReactNode;
};

/**
 * Session-scoped UnityPlayer (Phase B).
 * While a run is visible: UnityView flex:1, RN HUD as absolute overlay.
 * While hidden: Unity stays full-size behind opaque UI, paused (audio muted).
 * App background / inactive always pauses. No resumeUnity() (azesmway#34).
 */
export function UnityPlayerHost({
  sessionActive,
  visible,
  children,
}: Props): React.JSX.Element {
  const unityRef = useRef<UnityView>(null);
  const handlerRef = useRef<MessageHandler | null>(null);
  const [handoffCover, setHandoffCover] = useState(false);
  const effectiveVisible = visible && !handoffCover;
  const visibleRef = useRef(effectiveVisible);
  visibleRef.current = effectiveVisible;

  // New run (visible true again) clears post-score cover.
  useEffect(() => {
    if (visible) {
      setHandoffCover(false);
    }
  }, [visible]);

  const setMessageHandler = useCallback((handler: MessageHandler | null) => {
    handlerRef.current = handler;
  }, []);

  const setPaused = useCallback((paused: boolean) => {
    const view = unityRef.current;
    if (!view) {
      return;
    }
    try {
      if (Platform.OS === 'android') {
        view.windowFocusChanged(!paused);
      }
      view.pauseUnity(paused);
    } catch {
      // ignore
    }
  }, []);

  const pause = useCallback(() => {
    setPaused(true);
  }, [setPaused]);

  const hideForHandoff = useCallback(() => {
    setHandoffCover(true);
    setPaused(true);
  }, [setPaused]);

  useEffect(() => {
    if (!sessionActive) {
      return;
    }

    const sync = (appState = AppState.currentState) => {
      const appActive = appState === 'active';
      const shouldRun = visibleRef.current && appActive;
      if (shouldRun) {
        // Brief delay so the surface is laid out before unpausing.
        const timer = setTimeout(() => setPaused(false), 80);
        return () => clearTimeout(timer);
      }
      setPaused(true);
      // Android may auto-resume the player on window focus after maximize;
      // keep forcing pause while the run overlay is hidden.
      if (sessionActive && !visibleRef.current) {
        const t1 = setTimeout(() => setPaused(true), 100);
        const t2 = setTimeout(() => setPaused(true), 500);
        const t3 = setTimeout(() => setPaused(true), 1200);
        return () => {
          clearTimeout(t1);
          clearTimeout(t2);
          clearTimeout(t3);
        };
      }
      return undefined;
    };

    let clearUnpause = sync();

    const sub = AppState.addEventListener('change', next => {
      clearUnpause?.();
      clearUnpause = sync(next);
    });

    return () => {
      clearUnpause?.();
      sub.remove();
      setPaused(true);
    };
  }, [sessionActive, effectiveVisible, setPaused]);

  const value = useMemo(
    () => ({unityRef, setMessageHandler, pause, hideForHandoff}),
    [setMessageHandler, pause, hideForHandoff],
  );

  return (
    <UnityPlayerContext.Provider value={value}>
      <View style={styles.root}>
        {sessionActive ? (
          <UnityView
            ref={unityRef}
            style={effectiveVisible ? styles.unityFlex : styles.unityBehind}
            androidKeepPlayerMounted
            onUnityMessage={event => {
              handlerRef.current?.(event.nativeEvent.message);
            }}
          />
        ) : null}
        <View
          style={effectiveVisible ? styles.hudOverlay : styles.uiFull}
          pointerEvents={effectiveVisible ? 'box-none' : 'auto'}
          collapsable={false}>
          {children}
        </View>
      </View>
    </UnityPlayerContext.Provider>
  );
}

export function useUnityPlayer(): UnityPlayerContextValue {
  const ctx = useContext(UnityPlayerContext);
  if (!ctx) {
    throw new Error('useUnityPlayer requires UnityPlayerHost');
  }
  return ctx;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  /** Match working MatchRunScreen: Unity fills layout height. */
  unityFlex: {
    flex: 1,
  },
  /** Keep a real-sized surface under opaque tabs/result (do not use 1×1). */
  unityBehind: {
    ...StyleSheet.absoluteFill,
  },
  hudOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
  },
  uiFull: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
