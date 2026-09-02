import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import { useTheme } from '@/src/theme';
import { Durations, isReducedMotion } from '@/src/theme/motion';
import { useSettingsStore } from '@/src/store/settings';
import { Asterisk } from '@/src/components/Icons';

/**
 * Animated brand splash.
 *
 * The native splash (expo-splash-screen) is held until the JS bundle has
 * painted, then handed off to this overlay which plays a ~1.1 s brand beat:
 * the mark springs in behind two expanding rings, the wordmark staggers letter
 * by letter, a hairline sweep runs underneath, and the whole layer lifts and
 * fades out. Every frame is a UI-thread worklet using transform + opacity only,
 * so it holds 60 Hz on mid-range Android and reads as 120.
 *
 * With "Reduce motion" (OS-level or in-app) it collapses to a short cross-fade.
 */

const WORD = 'Copper';
const TAGLINE = 'The agent that finishes the job.';

/** Keep the native splash alive until we are ready to take over. */
export function holdNativeSplash(): void {
  if (Platform.OS === 'web') return;
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

function storesHydrated(): boolean {
  try {
    return !!useSettingsStore.persist?.hasHydrated?.();
  } catch {
    return true;
  }
}

/* --------------------------------- the gate --------------------------------- */

export function SplashGate({ children }: { children: React.ReactNode }) {
  const enabled = useSettingsStore((s) => s.appearance.splashAnimation);
  const [gone, setGone] = useState(false);

  return (
    <View style={styles.root}>
      {children}
      {gone ? null : <SplashLayer enabled={enabled} onGone={setGone} />}
    </View>
  );
}

/* -------------------------------- the layer -------------------------------- */

function SplashLayer({ enabled, onGone }: { enabled: boolean; onGone: (v: boolean) => void }) {
  const reduced = isReducedMotion();
  const { colors } = useTheme();
  const beat = !reduced && enabled ? Durations.splash : 240;

  const progress = useSharedValue(0);
  const exit = useSharedValue(0);
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);
  const sweep = useSharedValue(0);
  const [exiting, setExiting] = useState(false);
  const nativeHidden = useRef(false);

  const hideNative = useMemo(
    () => () => {
      if (nativeHidden.current) return;
      nativeHidden.current = true;
      if (Platform.OS !== 'web') SplashScreen.hideAsync().catch(() => {});
    },
    []
  );

  useEffect(() => {
    const id = requestAnimationFrame(() => hideNative());
    return () => cancelAnimationFrame(id);
  }, [hideNative]);

  useEffect(() => {
    progress.set(withTiming(1, { duration: beat, easing: Easing.bezier(0.16, 1, 0.3, 1) }));
    if (!reduced && enabled) {
      ring1.set(withRepeat(withTiming(1, { duration: 1500, easing: Easing.out(Easing.cubic) }), -1, false));
      ring2.set(withDelay(420, withRepeat(withTiming(1, { duration: 1500, easing: Easing.out(Easing.cubic) }), -1, false)));
      sweep.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, false));
    } else {
      ring1.set(1);
      ring2.set(1);
      sweep.set(1);
    }
  }, [beat, enabled, progress, reduced, ring1, ring2, sweep]);

  useEffect(() => {
    let cancelled = false;
    const start = Date.now();

    const finish = () => {
      if (cancelled) return;
      setExiting(true);
      exit.set(
        withTiming(1, { duration: reduced ? 120 : 280, easing: Easing.inOut(Easing.quad) }, (done) => {
          if (done) runOnJS(onGone)(true);
        })
      );
    };

    // Wait for store hydration *and* the minimum beat so it never cuts off.
    const tick = setInterval(() => {
      if (cancelled) return;
      if (storesHydrated() && Date.now() - start >= beat) {
        clearInterval(tick);
        finish();
      }
    }, 50);

    // Hard cap — never trap the user behind the splash.
    const guard = setTimeout(() => {
      if (cancelled) return;
      clearInterval(tick);
      finish();
    }, 4200);

    return () => {
      cancelled = true;
      clearInterval(tick);
      clearTimeout(guard);
    };
  }, [beat, exit, onGone, reduced]);

  const layerStyle = useAnimatedStyle(() => ({
    opacity: 1 - exit.get(),
    transform: [{ scale: interpolate(exit.get(), [0, 1], [1, 1.045]) }],
  }));

  const markStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: interpolate(p, [0, 0.18, 0.4], [0, 1, 1], 'clamp'),
      transform: [
        { scale: interpolate(p, [0, 0.42], [0.7, 1], 'clamp') },
        { rotate: `${interpolate(p, [0, 0.55], [-16, 0], 'clamp')}deg` },
      ],
    };
  });

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0.1, 0.5], [0, 0.6], 'clamp'),
    transform: [{ scale: interpolate(progress.get(), [0.1, 0.6], [0.85, 1.1], 'clamp') }],
  }));

  const ringAStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ring1.get(), [0, 0.75, 1], [0.45, 0.12, 0], 'clamp'),
    transform: [{ scale: interpolate(ring1.get(), [0, 1], [0.8, 1.9], 'clamp') }],
  }));

  const ringBStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ring2.get(), [0, 0.75, 1], [0.35, 0.1, 0], 'clamp'),
    transform: [{ scale: interpolate(ring2.get(), [0, 1], [0.8, 1.9], 'clamp') }],
  }));

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(sweep.get(), [0, 1], [-110, 110]) }],
    opacity: interpolate(sweep.get(), [0, 0.25, 0.75, 1], [0, 0.9, 0.9, 0]),
  }));

  const underlineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0.62, 0.9], [0, 1], 'clamp'),
    transform: [{ scaleX: interpolate(progress.get(), [0.62, 0.9], [0.4, 1], 'clamp') }],
  }));

  return (
    <Animated.View
      pointerEvents={exiting ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }, layerStyle]}
    >
      <LinearGradient
        colors={[colors.bg, colors.bgElevated, colors.bg]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
      />

      <View style={styles.center}>
        <View style={styles.markArea}>
          {!reduced && enabled ? (
            <>
              <Animated.View style={[styles.ring, { borderColor: colors.accent }, ringAStyle]} />
              <Animated.View style={[styles.ring, { borderColor: colors.accent }, ringBStyle]} />
            </>
          ) : null}

          <Animated.View style={[styles.glow, glowStyle]}>
            <LinearGradient
              colors={[colors.userBubbleFrom, colors.accent, colors.userBubbleTo]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.glowGradient}
            />
          </Animated.View>

          <Animated.View style={[styles.mark, markStyle]}>
            <LinearGradient
              colors={[colors.userBubbleFrom, colors.userBubbleTo]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.markGradient}
            >
              <Asterisk size={44} color="#FFFFFF" strokeWidth={2.6} />
            </LinearGradient>
          </Animated.View>
        </View>

        <SplashWord color={colors.text} progress={progress} reduced={reduced} />

        <Animated.Text style={[styles.tagline, { color: colors.textFaint }, underlineStyle]}>{TAGLINE}</Animated.Text>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressMask, { backgroundColor: colors.surface3 }]}>
          {!reduced && enabled ? (
            <Animated.View style={[styles.progressSweep, { backgroundColor: colors.accent }, sweepStyle]} />
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

/* ---------------------------- staggered wordmark ---------------------------- */

function SplashLetter({
  ch,
  index,
  color,
  progress,
  reduced,
}: {
  ch: string;
  index: number;
  color: string;
  progress: ReturnType<typeof useSharedValue<number>>;
  reduced: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const p = progress.get();
    const start = 0.26 + index * 0.04;
    const local = interpolate(p, [start, start + 0.2], [0, 1], 'clamp');
    return {
      opacity: local,
      transform: [{ translateY: reduced ? 0 : (1 - local) * 16 }],
    };
  });
  return <Animated.Text style={[styles.word, { color }, style]}>{ch}</Animated.Text>;
}

function SplashWord({
  color,
  progress,
  reduced,
}: {
  color: string;
  progress: ReturnType<typeof useSharedValue<number>>;
  reduced: boolean;
}) {
  return (
    <View style={styles.wordRow}>
      {WORD.split('').map((ch, i) => (
        <SplashLetter key={i} ch={ch} index={i} color={color} progress={progress} reduced={reduced} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
  markArea: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 132, height: 132, borderRadius: 66, borderWidth: 1.5, opacity: 0 },
  glow: { position: 'absolute', width: 168, height: 168, borderRadius: 84, overflow: 'hidden', opacity: 0 },
  glowGradient: { width: '100%', height: '100%', opacity: 0.3 },
  mark: { alignItems: 'center', justifyContent: 'center' },
  markGradient: {
    width: 108,
    height: 108,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#C15F3C', shadowOpacity: 0.45, shadowRadius: 28, shadowOffset: { width: 0, height: 10 } },
      android: { elevation: 14 },
      default: { boxShadow: '0 14px 40px rgba(193,95,60,0.35)' } as never,
    }),
  },
  wordRow: { flexDirection: 'row', marginTop: 26, height: 42, alignItems: 'flex-end' },
  word: { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  tagline: { marginTop: 6, fontSize: 13.5, fontWeight: '500', letterSpacing: 0.2 },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 96,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 54,
  },
  progressMask: { width: 132, height: 3, borderRadius: 2, overflow: 'hidden' },
  progressSweep: { width: 56, height: 3, borderRadius: 2 },
});
