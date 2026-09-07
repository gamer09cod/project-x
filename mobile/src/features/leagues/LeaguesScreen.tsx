import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors} from '../../theme';

export function LeaguesScreen(): React.JSX.Element {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Leagues</Text>
      <Text style={styles.body}>Coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {color: colors.textPrimary, fontSize: 22, fontWeight: '800'},
  body: {color: colors.textMuted, marginTop: 8},
});
