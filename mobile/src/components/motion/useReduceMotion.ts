import {useEffect, useState} from 'react';
import {AccessibilityInfo} from 'react-native';

/**
 * True when the OS "Reduce Motion" setting is on.
 *
 * Every primitive in this folder checks this and snaps straight to its final
 * value instead of animating, so motion is decorative and never load-bearing.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let alive = true;

    AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (alive) {
        setReduce(enabled);
      }
    });

    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduce,
    );

    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduce;
}
