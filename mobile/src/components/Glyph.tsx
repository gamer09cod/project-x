import React from 'react';
import {StyleSheet, Text} from 'react-native';

export type GlyphName =
  | 'trophy'
  | 'crown'
  | 'gamepad'
  | 'rocket'
  | 'user'
  | 'plus'
  | 'minus'
  | 'clock'
  | 'help'
  | 'close'
  | 'copy'
  | 'share'
  | 'flame'
  | 'zap'
  | 'cash'
  | 'coin'
  | 'back'
  | 'lock'
  | 'play'
  | 'userPlus'
  | 'check';

const GLYPH: Record<GlyphName, string> = {
  trophy: '🏆',
  crown: '👑',
  gamepad: '▶',
  rocket: '🚀',
  user: '☺',
  plus: '+',
  minus: '−',
  clock: '⏱',
  help: '?',
  close: '×',
  copy: '⧉',
  share: '↗',
  flame: '🔥',
  zap: '⚡',
  cash: '$',
  coin: '¢',
  back: '‹',
  lock: '🔒',
  play: '▶',
  userPlus: '+',
  check: '✓',
};

type Props = {
  name: GlyphName;
  color?: string;
  size?: number;
};

/** JS-only marks. Avoids lucide + svg native modules on New Architecture. */
export function Glyph({name, color, size = 16}: Props): React.JSX.Element {
  return (
    <Text style={[styles.glyph, {color, fontSize: size}]}>{GLYPH[name]}</Text>
  );
}

const styles = StyleSheet.create({
  glyph: {
    fontWeight: '700',
    textAlign: 'center',
  },
});
