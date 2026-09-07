import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, radii} from '../theme';

type Props = {
  progress?: number;
};

export function PrizeWheelProgress({progress = 0.2}: Props): React.JSX.Element {
  const fill = Math.max(0, Math.min(1, progress));

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Prize Wheel</Text>
      <View style={styles.capsule}>
        <View style={styles.wheel}>
          <Text style={styles.wheelMark}>◎</Text>
        </View>
        <View style={styles.track}>
          <View
            style={[styles.fill, {width: `${Math.round(fill * 100)}%`}]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  capsule: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(20, 20, 22, 0.92)',
    borderRadius: radii.pill,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  wheel: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelMark: {color: '#F5C542', fontSize: 18, fontWeight: '800'},
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1A1A1C',
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.prizeFill,
  },
});
