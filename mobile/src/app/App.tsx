import React, {useEffect, useState} from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';
import {onAuthStateChanged, type User} from '@react-native-firebase/auth';
import {EmailAuthScreen} from '../features/auth/EmailAuthScreen';
import {appAuth} from '../services/firebase';
import {AppShell} from './AppShell';
import {colors} from '../theme';

function App(): React.JSX.Element {
  const [user, setUser] = useState<User | null>(appAuth().currentUser);

  useEffect(() => {
    return onAuthStateChanged(appAuth(), next => {
      setUser(next);
    });
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      {!user ? (
        <EmailAuthScreen onSignedIn={() => undefined} />
      ) : (
        <AppShell />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});

export default App;
