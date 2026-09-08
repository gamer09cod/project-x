import React, {useRef} from 'react';
import {
  Animated,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {useReduceMotion} from './useReduceMotion';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
};

/**
 * Pressable that dips slightly while held.
 *
 * The style goes on the inner animated view so callers can pass the same
 * button style they already had and get the press response for free.
 */
export function PressableScale({
  children,
  style,
  scaleTo = 0.96,
  onPressIn,
  onPressOut,
  ...rest
}: Props): React.JSX.Element {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const spring = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 40,
      bounciness: 4,
    }).start();
  };

  const handleIn = (e: GestureResponderEvent) => {
    if (!reduce) {
      spring(scaleTo);
    }
    onPressIn?.(e);
  };

  const handleOut = (e: GestureResponderEvent) => {
    if (!reduce) {
      spring(1);
    }
    onPressOut?.(e);
  };

  return (
    <Pressable {...rest} onPressIn={handleIn} onPressOut={handleOut}>
      <Animated.View style={[style, {transform: [{scale}]}]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
