import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors} from '../theme';
import {Glyph} from './Glyph';

type Slot = {
  name?: string;
  score?: string;
  modifier?: string;
  searching?: boolean;
  locked?: boolean;
};

type Props = {
  left: Slot;
  right: Slot;
};

export function FaceoffAvatars({left, right}: Props): React.JSX.Element {
  return (
    <View style={styles.row}>
      <SlotView slot={left} />
      <SlotView slot={right} />
    </View>
  );
}

function SlotView({slot}: {slot: Slot}): React.JSX.Element {
  return (
    <View style={styles.col}>
      <View style={[styles.avatar, slot.searching ? styles.searching : null]}>
        <Glyph
          name={slot.locked ? 'lock' : 'user'}
          size={22}
          color={slot.locked ? colors.textTertiary : colors.textPrimary}
        />
      </View>
      {slot.name ? <Text style={styles.name}>{slot.name}</Text> : null}
      {slot.score != null ? <Text style={styles.score}>{slot.score}</Text> : null}
      {slot.modifier ? (
        <Text style={styles.mod}>{slot.modifier}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 36,
  },
  col: {
    alignItems: 'center',
    width: 120,
    gap: 6,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searching: {
    borderColor: colors.cash,
    opacity: 0.7,
  },
  name: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  score: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
  },
  mod: {
    color: colors.streak,
    fontSize: 14,
    fontWeight: '700',
  },
});
