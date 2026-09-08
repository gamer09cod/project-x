import React, {useEffect, useRef} from 'react';
import {Animated, Easing, StyleSheet, View} from 'react-native';
import {colors} from '../../theme';
import {useReduceMotion} from './useReduceMotion';

type Props = {
  color?: string;
  size?: number;
};

const COUNT = 3;
const CYCLE = 1200;

/**
 * Three dots fading in sequence, sized to sit inline after a status line so
 * the sentence itself looks like it is still working.
 */
export function LoadingDots({
  color = colors.textMuted,
  size = 5,
}: Props): React.JSX.Element {
  const reduce = useReduceMotion();
  const dots = useRef(
    Array.from({length: COUNT}, () => new Animated.Value(0.25)),
  ).current;

  useEffect(() => {
    if (reduce) {
      dots.forEach(d => d.setValue(0.6));
      return;
    }

    const loops = dots.map(d =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(d, {
            toValue: 1,
            duration: CYCLE / 2,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(d, {
            toValue: 0.25,
            duration: CYCLE / 2,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    );

    const timers = dots.map((_, i) =>
      setTimeout(() => loops[i].start(), (CYCLE / COUNT) * i),
    );

    return () => {
      timers.forEach(clearTimeout);
      loops.forEach(l => l.stop());
    };
  }, [dots, reduce]);

  return (
    <View style={styles.row}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            opacity: d,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: 4},
});
