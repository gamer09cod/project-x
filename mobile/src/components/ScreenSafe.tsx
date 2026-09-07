import React from 'react';
import {
  Platform,
  StatusBar,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {colors} from '../theme';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: Array<'top' | 'bottom'>;
};

/**
 * Safe padding without react-native-safe-area-context (extra native module).
 */
export function ScreenSafe({
  children,
  style,
  edges = ['top'],
}: Props): React.JSX.Element {
  const padTop = edges.includes('top')
    ? Platform.OS === 'android'
      ? StatusBar.currentHeight ?? 0
      : 54
    : 0;
  const padBottom = edges.includes('bottom') ? 12 : 0;

  return (
    <View
      style={[
        styles.root,
        {paddingTop: padTop, paddingBottom: padBottom},
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
