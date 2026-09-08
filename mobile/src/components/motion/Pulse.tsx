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
  min?: number;
  max?: number;
  duration?: number;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Slow breathing scale. Kept subtle so it reads as alive, not as a button. */
export function Pulse({
  children,
  min = 1,
  max = 1.06,
  duration = 1400,
  active = true,
  style,
}: Props): React.JSX.Element {
  const reduce = useReduceMotion();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || reduce) {
      t.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(t, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [active, duration, reduce, t]);

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            {scale: t.interpolate({inputRange: [0, 1], outputRange: [min, max]})},
          ],
        },
      ]}>
      {children}
    </Animated.View>
  );
}
