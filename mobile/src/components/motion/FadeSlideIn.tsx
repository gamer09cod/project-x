import React, {useEffect, useRef} from 'react';
import {
  Animated,
  Easing,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {useReduceMotion} from './useReduceMotion';

type Props = {
  children: React.ReactNode;
  /** Stagger offset in ms. Sibling blocks 60-80ms apart read as a sequence. */
  delay?: number;
  duration?: number;
  /** Upward travel in px. 0 gives a pure fade. */
  distance?: number;
  /** Set below 1 to add a pop, e.g. 0.85 for a hero number. */
  scaleFrom?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Entrance animation: fade up, optionally with a scale pop.
 *
 * Transform and opacity only, so this runs on the native driver and stays
 * smooth while JS is busy handling a callable response.
 */
export function FadeSlideIn({
  children,
  delay = 0,
  duration = 260,
  distance = 12,
  scaleFrom,
  style,
}: Props): React.JSX.Element {
  const reduce = useReduceMotion();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) {
      t.setValue(1);
      return;
    }

    const anim = Animated.timing(t, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    anim.start();
    return () => anim.stop();
  }, [delay, duration, reduce, t]);

  const transform: Array<
    | {translateY: Animated.AnimatedInterpolation<number>}
    | {scale: Animated.AnimatedInterpolation<number>}
  > = [];

  if (distance !== 0) {
    transform.push({
      translateY: t.interpolate({
        inputRange: [0, 1],
        outputRange: [distance, 0],
      }),
    });
  }

  if (scaleFrom != null) {
    transform.push({
      scale: t.interpolate({inputRange: [0, 1], outputRange: [scaleFrom, 1]}),
    });
  }

  return (
    <Animated.View style={[style, {opacity: t, transform}]}>
      {children}
    </Animated.View>
  );
}
