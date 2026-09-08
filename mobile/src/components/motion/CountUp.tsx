import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Text,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import {useReduceMotion} from './useReduceMotion';

type Props = {
  /** The server-provided value. The animation only ever travels toward this. */
  value: number;
  duration?: number;
  /** Receives a rounded integer, never a partial frame value. */
  format?: (n: number) => string;
  style?: StyleProp<TextStyle>;
};

/**
 * Counts a number up to its final value.
 *
 * Money safety: the tween is presentation only. It starts at zero, ends on the
 * exact value passed in, and the settled frame is written from `value` rather
 * than from the animation, so a dropped frame can never leave a wrong amount on
 * screen. Nothing here derives or adjusts an amount.
 */
export function CountUp({
  value,
  duration = 600,
  format,
  style,
}: Props): React.JSX.Element {
  const reduce = useReduceMotion();
  const [display, setDisplay] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;
  const from = useRef(0);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      from.current = value;
      return;
    }

    anim.setValue(from.current);
    const id = anim.addListener(frame => setDisplay(frame.value));

    const tween = Animated.timing(anim, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.cubic),
      // A number rendered into a Text node cannot be driven natively.
      useNativeDriver: false,
    });

    tween.start(() => {
      setDisplay(value);
      from.current = value;
    });

    return () => {
      tween.stop();
      anim.removeListener(id);
    };
  }, [anim, duration, reduce, value]);

  const rounded = Math.round(display);

  return <Text style={style}>{format ? format(rounded) : String(rounded)}</Text>;
}
