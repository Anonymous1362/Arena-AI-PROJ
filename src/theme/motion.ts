import { withSpring, withTiming } from 'react-native-reanimated';
import { Easing } from 'react-native-reanimated';

/**
 * Motion language: quick, springy, never bouncy-cheap.
 *
 * All springs run on the UI thread (Reanimated), which is what keeps
 * interactions at a buttery 60–120 fps even on mid-range Android. Tune the
 * preset per use-case — never per-frame work in JS during an animation.
 */
export const Spring = {
  /** Fast tactile feedback for presses / small UI. */
  snappy: { damping: 26, stiffness: 340, mass: 0.9 },
  /** Default list / layout spring. */
  gentle: { damping: 22, stiffness: 220, mass: 1 },
  /** Heavy, floaty elements (sheets, overlays). */
  soft: { damping: 30, stiffness: 180, mass: 1 },
  /** Playful pop — splash mark, celebratory states. */
  bouncy: { damping: 13, stiffness: 240, mass: 0.7 },
  /** Sheets: settle with a tiny overshoot then glue to the bottom. */
  overlay: { damping: 24, stiffness: 300, mass: 1 },
  /** Tab switches: quick, no overshoot. */
  tab: { damping: 28, stiffness: 380, mass: 0.8 },
};

/** Cubic-bezier equivalents of the classic ease-out feel (material-ish). */
const easeOutQuint = Easing.bezier(0.22, 1, 0.36, 1);
const easeInOutCubic = Easing.inOut(Easing.cubic);

export const Timing = {
  fast: (to: number) => withTiming(to, { duration: 130, easing: easeInOutCubic }),
  normal: (to: number) => withTiming(to, { duration: 220, easing: easeInOutCubic }),
  slow: (to: number) => withTiming(to, { duration: 340, easing: easeOutQuint }),
  // Long, luxurious fades (splash dissolve, overlays).
  cinematic: (to: number) => withTiming(to, { duration: 520, easing: easeInOutCubic }),
};

export const springTo = (v: any, to: number, preset: keyof typeof Spring = 'snappy') =>
  withSpring(to, Spring[preset]);
