import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, radii} from '../theme';
import {formatCentsDisplay} from '../lib/formatMoney';
import {Glyph} from './Glyph';

type Props = {
  balanceCents: number | null;
  rating: number | null;
  onDeposit: () => void;
};

export function TopBarHeader({
  balanceCents,
  rating,
  onDeposit,
}: Props): React.JSX.Element {
  const balance =
    balanceCents == null ? '—' : formatCentsDisplay(balanceCents);
  const rankLabel = rating == null ? '—' : String(rating);

  return (
    <View style={styles.row}>
      <View style={styles.pill}>
        <View style={styles.avatar}>
          <Glyph name="user" size={14} color={colors.textPrimary} />
        </View>
        <Glyph name="crown" size={14} color={colors.streak} />
        <Text style={styles.rank}>{rankLabel}</Text>
      </View>

      <View style={styles.walletWrap}>
        <View style={styles.walletGlow} />
        <Pressable style={styles.pill} onPress={onDeposit}>
          <Glyph name="cash" size={14} color={colors.cash} />
          <Text style={styles.balance}>{balance}</Text>
          <View style={styles.plus}>
            <Glyph name="plus" size={14} color={colors.bg} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(20, 20, 22, 0.92)',
    borderRadius: radii.pill,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rank: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  walletWrap: {
    position: 'relative',
  },
  walletGlow: {
    position: 'absolute',
    right: -8,
    top: -10,
    width: 88,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 230, 118, 0.18)',
  },
  balance: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  plus: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.cash,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
