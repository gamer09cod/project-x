import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import {Platform, StyleSheet, View} from 'react-native';
import UnityView from '@azesmway/react-native-unity';

type MessageHandler = (raw: string) => void;

type UnityPlayerContextValue = {
  unityRef: RefObject<UnityView | null>;
  setMessageHandler: (handler: MessageHandler | null) => void;
  pause: () => void;
};

const UnityPlayerContext = createContext<UnityPlayerContextValue | null>(null);

type Props = {
  sessionActive: boolean;
  visible: boolean;
  children: ReactNode;
};

/**
 * Session-scoped UnityPlayer (Phase B).
 * While a run is visible: same layout as the working build — UnityView flex:1,
 * RN HUD as absolute overlay (transparent). While hidden: Unity stays full-size
 * behind opaque screens (never 1×1 park). No resumeUnity() (azesmway#34).
 */
export function UnityPlayerHost({
  sessionActive,
  visible,
  children,
}: Props): React.JSX.Element {
  const unityRef = useRef<UnityView>(null);
  const handlerRef = useRef<MessageHandler | null>(null);

  const setMessageHandler = useCallback((handler: MessageHandler | null) => {
    handlerRef.current = handler;
  }, []);

  const pause = useCallback(() => {
    try {
      unityRef.current?.pauseUnity(true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!sessionActive || !visible) {
      return;
    }
    const timer = setTimeout(() => {
      const view = unityRef.current;
      if (!view) {
        return;
      }
      try {
        if (Platform.OS === 'android') {
          view.windowFocusChanged(true);
        }
        view.pauseUnity(false);
      } catch {
        // ignore
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [sessionActive, visible]);

  const value = useMemo(
    () => ({unityRef, setMessageHandler, pause}),
    [setMessageHandler, pause],
  );

  return (
    <UnityPlayerContext.Provider value={value}>
      <View style={styles.root}>
        {sessionActive ? (
          <UnityView
            ref={unityRef}
            style={visible ? styles.unityFlex : styles.unityBehind}
            androidKeepPlayerMounted
            onUnityMessage={event => {
              handlerRef.current?.(event.nativeEvent.message);
            }}
          />
        ) : null}
        <View
          style={visible ? styles.hudOverlay : styles.uiFull}
          pointerEvents={visible ? 'box-none' : 'auto'}
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
    backgroundColor: '#000',
  },
  /** Match working MatchRunScreen: Unity fills layout height. */
  unityFlex: {
    flex: 1,
  },
  /** Keep a real-sized surface under opaque tabs/result (do not use 1×1). */
  unityBehind: {
    ...StyleSheet.absoluteFillObject,
  },
  hudOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  uiFull: {
    flex: 1,
  },
});
