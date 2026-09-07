import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import type {Cents} from '@project-x/shared';
import {colors, radii} from '../theme';
import {formatCentsDisplay} from '../lib/formatMoney';
import {clampStakeIndex, stakeAt, STAKE_OPTIONS_CENTS} from '../lib/stakes';
import {Glyph} from './Glyph';

type Props = {
  index: number;
  onChangeIndex: (next: number) => void;
};

export function WagerStepper({index, onChangeIndex}: Props): React.JSX.Element {
  const amount: Cents = stakeAt(index);

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.btn}
        onPress={() => onChangeIndex(clampStakeIndex(index - 1))}
        disabled={index <= 0}>
        <Glyph
          name="minus"
          size={18}
          color={index <= 0 ? colors.textTertiary : colors.textPrimary}
        />
      </Pressable>
      <Text style={styles.amount}>{formatCentsDisplay(amount)}</Text>
      <Pressable
        style={styles.btn}
        onPress={() => onChangeIndex(clampStakeIndex(index + 1))}
        disabled={index >= STAKE_OPTIONS_CENTS.length - 1}>
        <Glyph
          name="plus"
          size={18}
          color={
            index >= STAKE_OPTIONS_CENTS.length - 1
              ? colors.textTertiary
              : colors.textPrimary
          }
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.card,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    minWidth: 132,
  },
  btn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amount: {
    flex: 1,
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
});
