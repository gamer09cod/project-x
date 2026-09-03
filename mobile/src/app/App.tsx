import React from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';
import {UnityPingScreen} from '../features/embed/UnityPingScreen';

function App(): React.JSX.Element {
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <UnityPingScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export default App;
