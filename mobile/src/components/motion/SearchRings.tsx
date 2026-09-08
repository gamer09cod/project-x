import React, {useEffect, useRef} from 'react';
import {Animated, Easing, StyleSheet} from 'react-native';
import {colors} from '../../theme';
import {useReduceMotion} from './useReduceMotion';

type Props = {
  /** Diameter of the element the rings emanate from. */
  size: number;
  color?: string;
  count?: number;
  duration?: number;
  active?: boolean;
};

const MAX_SCALE = 1.9;

/**
 * Radar pings for a slot that is still being filled.
 *
 * Rings are absolutely positioned and non-interactive, so they can be dropped
 * behind an avatar without affecting layout or touch handling.
 */
export function SearchRings({
  size,
  color = colors.cash,
  count = 3,
  duration = 2200,
  active = true,
}: Props): React.JSX.Element | null {
  const reduce = useReduceMotion();
  const rings = useRef(
    Array.from({length: count}, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    if (!active || reduce) {
      rings.forEach(r => r.setValue(0));
      return;
    }

    const loops = rings.map(r =>
      Animated.loop(
        Animated.timing(r, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ),
    );

    // Staggered starts rather than a delay inside the loop: a delay would
    // repeat every iteration and turn a continuous sweep into a pulse-and-gap.
    const timers = rings.map((r, i) =>
      setTimeout(() => {
        r.setValue(0);
        loops[i].start();
      }, (duration / count) * i),
    );

    return () => {
      timers.forEach(clearTimeout);
      loops.forEach(l => l.stop());
    };
  }, [active, count, duration, reduce, rings]);

  if (!active || reduce) {
    return null;
  }

  return (
    <>
      {rings.map((r, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[
            styles.ring,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: color,
              opacity: r.interpolate({
                inputRange: [0, 1],
                outputRange: [0.5, 0],
              }),
              transform: [
                {
                  scale: r.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, MAX_SCALE],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    borderWidth: 2,
  },
});
