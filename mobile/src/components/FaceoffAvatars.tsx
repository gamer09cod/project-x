import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors} from '../theme';
import {Glyph} from './Glyph';
import {SearchRings} from './motion';

const AVATAR = 84;

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
  /** Optional badge rendered between the two slots, e.g. a VS pill. */
  center?: React.ReactNode;
};

export function FaceoffAvatars({
  left,
  right,
  center,
}: Props): React.JSX.Element {
  return (
    <View style={styles.row}>
      <SlotView slot={left} />
      {center ? <View style={styles.center}>{center}</View> : null}
      <SlotView slot={right} />
    </View>
  );
}

function SlotView({slot}: {slot: Slot}): React.JSX.Element {
  return (
    <View style={styles.col}>
      <View style={styles.avatarWrap}>
        {/* Behind the avatar so the rings read as emanating from it. */}
        <SearchRings size={AVATAR} active={Boolean(slot.searching)} />
        <View style={[styles.avatar, slot.searching ? styles.searching : null]}>
          <Glyph
            name={slot.locked ? 'lock' : 'user'}
            size={22}
            color={slot.locked ? colors.textTertiary : colors.textPrimary}
          />
        </View>
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
    alignItems: 'center',
    gap: 20,
  },
  col: {
    alignItems: 'center',
    width: 112,
    gap: 6,
  },
  center: {
    // Nudged up so it optically centres against the avatars, not the labels.
    marginBottom: 28,
  },
  avatarWrap: {
    width: AVATAR,
    height: AVATAR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searching: {
    borderColor: colors.cash,
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
