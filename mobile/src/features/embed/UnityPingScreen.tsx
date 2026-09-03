import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import UnityView from '@azesmway/react-native-unity';
import {
  UNITY_BRIDGE_HOST,
  UNITY_BRIDGE_METHOD,
  makePing,
  parsePong,
} from '../../bridge/ping';

function newNonce(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Phase 3 device spike: mount UnityView at flex 1, ping, show pong.
 * Do not use this mount path for paid matches (join/start must succeed first).
 */
export function UnityPingScreen(): React.JSX.Element {
  const unityRef = useRef<UnityView>(null);
  const [status, setStatus] = useState('Waiting for Unity…');
  const [lastPong, setLastPong] = useState<string | null>(null);

  const sendPing = useCallback(() => {
    const view = unityRef.current;
    if (!view) {
      setStatus('UnityView ref is null');
      return;
    }
    const nonce = newNonce();
    view.postMessage(
      UNITY_BRIDGE_HOST,
      UNITY_BRIDGE_METHOD,
      JSON.stringify(makePing(nonce)),
    );
    setStatus(`Sent ping ${nonce}`);
  }, []);

  useEffect(() => {
    const timer = setTimeout(sendPing, 800);
    return () => clearTimeout(timer);
  }, [sendPing]);

  return (
    <View style={styles.root}>
      <UnityView
        ref={unityRef}
        style={styles.unity}
        onUnityMessage={event => {
          const raw = event.nativeEvent.message;
          const pong = parsePong(raw);
          if (pong) {
            setLastPong(raw);
            setStatus(`Pong ok · ${pong.unityBuildId}`);
            return;
          }
          setStatus(`Unity said: ${raw}`);
        }}
      />
      <View style={styles.hud} pointerEvents="box-none">
        <Text style={styles.hudTitle}>Phase 3 embed</Text>
        <Text style={styles.hudLine}>{status}</Text>
        {lastPong ? <Text style={styles.hudMono}>{lastPong}</Text> : null}
        <Pressable style={styles.button} onPress={sendPing}>
          <Text style={styles.buttonLabel}>Ping Unity</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0b1420',
  },
  unity: {
    flex: 1,
  },
  hud: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 32,
    gap: 8,
  },
  hudTitle: {
    color: '#f4f7fb',
    fontSize: 18,
    fontWeight: '600',
  },
  hudLine: {
    color: '#c5d0dc',
    fontSize: 14,
  },
  hudMono: {
    color: '#9ec5ff',
    fontFamily: 'monospace',
    fontSize: 12,
  },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: '#2f6fed',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonLabel: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
