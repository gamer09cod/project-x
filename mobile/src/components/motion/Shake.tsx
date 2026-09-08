import React, {useEffect, useRef} from 'react';
import {Animated, type StyleProp, type ViewStyle} from 'react-native';
import {useReduceMotion} from './useReduceMotion';

type Props = {
  children: React.ReactNode;
  /** Shakes once whenever this value changes to something truthy. */
  trigger: unknown;
  amplitude?: number;
  style?: StyleProp<ViewStyle>;
};

/** One horizontal shake, for a rejection or a failed step. */
export function Shake({
  children,
  trigger,
  amplitude = 8,
  style,
}: Props): React.JSX.Element {
  const reduce = useReduceMotion();
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!trigger || reduce) {
      return;
    }

    const hop = (toValue: number, duration: number) =>
      Animated.timing(x, {toValue, duration, useNativeDriver: true});

    const anim = Animated.sequence([
      hop(-amplitude, 50),
      hop(amplitude, 50),
      hop(-amplitude * 0.5, 40),
      hop(amplitude * 0.5, 40),
      hop(0, 40),
    ]);

    anim.start();
    return () => anim.stop();
  }, [amplitude, reduce, trigger, x]);

  return (
    <Animated.View style={[style, {transform: [{translateX: x}]}]}>
      {children}
    </Animated.View>
  );
}
