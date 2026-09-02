import { withSpring, withTiming } from 'react-native-reanimated';

/** Motion language: quick, springy, never bouncy-cheap. */
export const Spring = {
  snappy: { damping: 26, stiffness: 340, mass: 0.9 },
  gentle: { damping: 22, stiffness: 220, mass: 1 },
  soft: { damping: 30, stiffness: 180, mass: 1 },
};

export const Timing = {
  fast: (to: number) => withTiming(to, { duration: 140 }),
  normal: (to: number) => withTiming(to, { duration: 220 }),
  slow: (to: number) => withTiming(to, { duration: 340 }),
};

export const springTo = (v: any, to: number, preset: keyof typeof Spring = 'snappy') =>
  withSpring(to, Spring[preset]);
