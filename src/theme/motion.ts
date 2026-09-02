/**
 * Motion language.
 *
 * Everything here runs on the UI thread through Reanimated worklets — no
 * setState-driven animation, no JS-thread frame drops. The goal is a
 * "120 fps feel" on 60 Hz Android hardware, which in practice means:
 *
 *  - short, decisive curves (nothing over ~380 ms for UI chrome)
 *  - springs tuned critically damped: fast attack, no cheap bounce
 *  - transform + opacity only (compositor-cheap, never layout)
 *  - staggered entrances instead of one big fade
 *  - one `MotionLevel` switch so users on low-end devices (or with the OS
 *    "Remove animations" setting on) can dial the whole thing down to zero.
 */
import { useMemo } from 'react';
import {
  Easing,
  FadeInDown,
  FadeInUp,
  FadeOut,
  ZoomIn,
  SlideInRight,
  SlideOutLeft,
  useReducedMotion,
  type EasingFunction,
} from 'react-native-reanimated';
import { useSettingsStore, type MotionLevel } from '@/src/store/settings';

/* --------------------------------- springs --------------------------------- */

export const Spring = {
  /** Buttons, chips, small chrome. Settles in ~120 ms. */
  snappy: { damping: 26, stiffness: 340, mass: 0.9 },
  /** Sheets, cards, medium surfaces. */
  gentle: { damping: 24, stiffness: 250, mass: 1 },
  /** Large surfaces. */
  soft: { damping: 30, stiffness: 190, mass: 1 },
  /** iOS 17 "responsive": high stiffness, heavy damping, tiny mass. */
  responsive: { damping: 34, stiffness: 520, mass: 0.7 },
  /** Overshoot-free glide for page-level transitions and the tab pill. */
  glide: { damping: 32, stiffness: 210, mass: 1.05 },
};

export type SpringPreset = keyof typeof Spring;

/* -------------------------------- durations -------------------------------- */

export const Durations = {
  instant: 90,
  fast: 140,
  normal: 210,
  smooth: 280,
  slow: 380,
  splash: 1100,
};

/* ---------------------------------- easings --------------------------------- */

/** iOS-flavoured curves. `out` decelerates hard — reads as "expensive". */
export const Ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1) as unknown as EasingFunction,
  in: Easing.bezier(0.7, 0, 0.84, 0) as unknown as EasingFunction,
  inOut: Easing.bezier(0.65, 0, 0.35, 1) as unknown as EasingFunction,
  springish: Easing.bezier(0.34, 1.36, 0.64, 1) as unknown as EasingFunction,
  standard: Easing.bezier(0.2, 0, 0, 1) as unknown as EasingFunction,
};

export const timingConfig = (duration: keyof typeof Durations = 'normal', easing: EasingFunction = Ease.out) => ({
  duration: Durations[duration],
  easing,
});

/* ------------------------------ motion scaling ------------------------------ */

/**
 * Reads the user's motion preference *and* the OS reduce-motion flag.
 * `distance(px)` collapses travel to 0 and `duration(ms)` collapses to ~1 ms
 * when motion is reduced, so every animation still "completes" (state stays
 * consistent) without moving anything.
 */
export function useMotion() {
  const level = useSettingsStore((s) => s.appearance.motion);
  const systemReduced = useReducedMotion();
  return useMemo(() => {
    const reduced = level === 'reduced' || !!systemReduced;
    return {
      level,
      reduced,
      distance: (px: number) => (reduced ? 0 : px),
      duration: (ms: number) => (reduced ? 1 : level === 'full' ? ms : Math.round(ms * 0.92)),
      spring: (preset: SpringPreset) =>
        reduced ? { damping: 40, stiffness: 900, mass: 0.6 } : Spring[preset],
      stagger: (ms: number) => (reduced ? 0 : ms),
    };
  }, [level, systemReduced]);
}

export type Motion = ReturnType<typeof useMotion>;

/** Non-hook read for imperative code paths outside render. */
export function motionLevel(): MotionLevel {
  return useSettingsStore.getState().appearance.motion;
}

export function isReducedMotion(): boolean {
  return motionLevel() === 'reduced';
}

/* ------------------------------ entrance presets ---------------------------- */

/** Staggered list entrance; delay is capped so long lists never crawl. */
export function enterStagger(index: number, delayStep = 24) {
  if (isReducedMotion()) return FadeInDown.duration(1);
  return FadeInDown.springify()
    .damping(26)
    .stiffness(260)
    .delay(Math.min(index, 10) * delayStep);
}

export function enterPop(index = 0) {
  if (isReducedMotion()) return ZoomIn.duration(1);
  return ZoomIn.springify().damping(18).stiffness(280).delay(Math.min(index, 8) * 20);
}

export function enterMessage() {
  if (isReducedMotion()) return FadeInUp.duration(1);
  return FadeInUp.springify().damping(24).stiffness(240);
}

export const exitFade = () => (isReducedMotion() ? FadeOut.duration(1) : FadeOut.duration(Durations.fast));
export const enterSlide = () => (isReducedMotion() ? FadeInDown.duration(1) : SlideInRight.springify().damping(28).stiffness(240));
export const exitSlide = () => (isReducedMotion() ? FadeOut.duration(1) : SlideOutLeft.duration(Durations.fast));

/** Multiply-through helper used by animated styles that must respect reduced motion. */
export const springTo = (to: number, preset: SpringPreset = 'snappy') => ({ to, preset });
