import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {colors, radii} from '../../theme';
import {useReduceMotion} from './useReduceMotion';

type Props = {
  height: number;
  width?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Skeleton placeholder with a sweeping highlight.
 *
 * Preferred over a spinner while a value loads: it holds the final layout, so
 * nothing jumps when the real number arrives.
 */
export function Shimmer({
  height,
  width,
  radius = radii.thumb,
  style,
}: Props): React.JSX.Element {
  const reduce = useReduceMotion();
  const t = useRef(new Animated.Value(0)).current;
  const [measured, setMeasured] = useState(0);

  useEffect(() => {
    if (reduce || measured === 0) {
      return;
    }

    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    loop.start();
    return () => loop.stop();
  }, [measured, reduce, t]);

  return (
    <View
      onLayout={e => setMeasured(e.nativeEvent.layout.width)}
      style={[
        styles.base,
        {height, borderRadius: radius},
        width != null ? {width} : styles.stretch,
        style,
      ]}>
      {measured > 0 && !reduce ? (
        <Animated.View
          style={[
            styles.sweep,
            {
              width: measured * 0.5,
              transform: [
                {
                  translateX: t.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-measured * 0.5, measured],
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  stretch: {alignSelf: 'stretch'},
  sweep: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
});
