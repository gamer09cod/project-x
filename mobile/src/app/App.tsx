import React, {useEffect, useState} from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';
import {onAuthStateChanged, type User} from '@react-native-firebase/auth';
import {EmailAuthScreen} from '../features/auth/EmailAuthScreen';
import {UnityPingScreen} from '../features/embed/UnityPingScreen';
import {WalletDebugScreen} from '../features/wallet/WalletDebugScreen';
import {appAuth} from '../services/firebase';

type Screen = 'auth' | 'wallet' | 'unity';

function App(): React.JSX.Element {
  const [user, setUser] = useState<User | null>(appAuth().currentUser);
  const [screen, setScreen] = useState<Screen>(
    appAuth().currentUser ? 'wallet' : 'auth',
  );

  useEffect(() => {
    return onAuthStateChanged(appAuth(), next => {
      setUser(next);
      setScreen(next ? 'wallet' : 'auth');
    });
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      {!user || screen === 'auth' ? (
        <EmailAuthScreen onSignedIn={() => setScreen('wallet')} />
      ) : screen === 'unity' ? (
        <UnityPingScreen onBack={() => setScreen('wallet')} />
      ) : (
        <WalletDebugScreen onOpenUnity={() => setScreen('unity')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export default App;
