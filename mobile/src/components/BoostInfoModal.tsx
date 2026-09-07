import React from 'react';
import {Modal, Pressable, StyleSheet, Text} from 'react-native';
import {colors, radii} from '../theme';
import {PRIZE_BOOST_BODY} from '../fixtures/boosts';
import {Glyph} from './Glyph';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function BoostInfoModal({visible, onClose}: Props): React.JSX.Element {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={styles.sheet}
          onPress={e => e.stopPropagation()}>
          <Pressable style={styles.close} onPress={onClose} hitSlop={12}>
            <Glyph name="close" size={18} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.title}>Prize Boost</Text>
          <Text style={styles.body}>{PRIZE_BOOST_BODY}</Text>
          <Pressable style={styles.cta} onPress={onClose}>
            <Text style={styles.ctaLabel}>Got it</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.cardLg,
    borderTopRightRadius: radii.cardLg,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 14,
  },
  close: {
    position: 'absolute',
    right: 16,
    top: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    marginTop: 8,
  },
  body: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  cta: {
    backgroundColor: colors.cash,
    borderRadius: radii.pill,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaLabel: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
});
