import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useSettingsStore } from '@/src/store/settings';

export const BRAND = {
  name: 'Copper',
  tagline: 'The agent that finishes the job.',
  accent: '#C15F3C',
  accent2: '#9A8F80',
  cream: '#F0EEE6',
  ink: '#1F1E1B',
};

export type Scheme = 'light' | 'dark';

export interface ThemeColors {
  bg: string;
  bgElevated: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  borderStrong: string;
  text: string;
  textSub: string;
  textFaint: string;
  accent: string;
  accentSoft: string;
  accent2: string;
  onAccent: string;
  danger: string;
  dangerSoft: string;
  success: string;
  warning: string;
  userBubbleFrom: string;
  userBubbleTo: string;
  tabBar: string;
  backdrop: string;
  reasoningBg: string;
  termBg: string;
  termText: string;
}

/* Warm, editorial, professional. Light is the signature; dark is warm charcoal. */
export const themes: Record<Scheme, ThemeColors> = {
  light: {
    bg: '#F0EEE6',
    bgElevated: '#FAF9F5',
    surface: '#FFFFFF',
    surface2: '#F4F2EC',
    surface3: '#E9E6DC',
    border: 'rgba(31,30,27,0.10)',
    borderStrong: 'rgba(31,30,27,0.18)',
    text: '#1F1E1B',
    textSub: '#5E5C55',
    textFaint: '#9B988E',
    accent: '#C15F3C',
    accentSoft: 'rgba(193,95,60,0.10)',
    accent2: '#8A857A',
    onAccent: '#FFFFFF',
    danger: '#B3261E',
    dangerSoft: 'rgba(179,38,30,0.08)',
    success: '#3D7A46',
    warning: '#B07C22',
    userBubbleFrom: '#C15F3C',
    userBubbleTo: '#A94E2F',
    tabBar: 'rgba(240,238,230,0.9)',
    backdrop: 'rgba(31,30,27,0.32)',
    reasoningBg: 'rgba(138,133,122,0.09)',
    termBg: '#26241F',
    termText: '#E8E4D8',
  },
  dark: {
    bg: '#191817',
    bgElevated: '#201F1D',
    surface: '#242320',
    surface2: '#2C2A26',
    surface3: '#363430',
    border: 'rgba(240,238,230,0.09)',
    borderStrong: 'rgba(240,238,230,0.16)',
    text: '#F2F0E9',
    textSub: '#ABA79C',
    textFaint: '#77746B',
    accent: '#D97757',
    accentSoft: 'rgba(217,119,87,0.13)',
    accent2: '#9A958A',
    onAccent: '#FFFFFF',
    danger: '#E5664F',
    dangerSoft: 'rgba(229,102,79,0.12)',
    success: '#5BA367',
    warning: '#D19A3D',
    userBubbleFrom: '#C15F3C',
    userBubbleTo: '#A94E2F',
    tabBar: 'rgba(25,24,23,0.88)',
    backdrop: 'rgba(0,0,0,0.5)',
    reasoningBg: 'rgba(154,149,138,0.08)',
    termBg: '#111110',
    termText: '#E8E4D8',
  },
};

export const spacing = (n: number) => n * 4;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  full: 999,
};

export const typeScale = {
  micro: { fontSize: 11, fontWeight: '600' as const },
  caption: { fontSize: 12.5, fontWeight: '500' as const },
  body: { fontSize: 15.5, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15.5, fontWeight: '600' as const },
  title: { fontSize: 17, fontWeight: '700' as const },
  headline: { fontSize: 22, fontWeight: '800' as const },
  display: { fontSize: 28, fontWeight: '800' as const },
};

export interface ResolvedTheme {
  scheme: Scheme;
  colors: ThemeColors;
  /** base font size for chat message text */
  msgFontSize: number;
}

interface ThemeContextValue extends ResolvedTheme {}

const ThemeContext = createContext<ThemeContextValue>({
  scheme: 'light',
  colors: themes.light,
  msgFontSize: 15.5,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = useSettingsStore((s) => s.appearance.theme);
  const msgSize = useSettingsStore((s) => s.appearance.messageTextSize);
  const system = useColorScheme();

  const scheme: Scheme = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
  const msgFontSize = msgSize === 's' ? 14 : msgSize === 'l' ? 17 : 15.5;

  const value = useMemo<ResolvedTheme>(
    () => ({ scheme, colors: themes[scheme], msgFontSize }),
    [scheme, msgFontSize]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
