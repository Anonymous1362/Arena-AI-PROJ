import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useSettingsStore } from '@/src/store/settings';

export const BRAND = {
  name: 'Aurora',
  tagline: 'Private AI, on your terms.',
  accent: '#7C6CFF',
  accent2: '#2BD9FE',
  gradient: ['#7C6CFF', '#5B8DEF', '#2BD9FE'] as const,
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
}

export const themes: Record<Scheme, ThemeColors> = {
  dark: {
    bg: '#09090C',
    bgElevated: '#101014',
    surface: '#15151B',
    surface2: '#1C1C24',
    surface3: '#24242E',
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(255,255,255,0.14)',
    text: '#F4F4F6',
    textSub: '#A2A2AE',
    textFaint: '#64646E',
    accent: '#8B7CFF',
    accentSoft: 'rgba(124,108,255,0.16)',
    accent2: '#2BD9FE',
    onAccent: '#FFFFFF',
    danger: '#FF5D6C',
    dangerSoft: 'rgba(255,93,108,0.14)',
    success: '#3ED598',
    warning: '#FFB020',
    userBubbleFrom: '#7C6CFF',
    userBubbleTo: '#5B8DEF',
    tabBar: 'rgba(12,12,16,0.85)',
    backdrop: 'rgba(0,0,0,0.55)',
    reasoningBg: 'rgba(124,108,255,0.07)',
  },
  light: {
    bg: '#F6F6F9',
    bgElevated: '#FFFFFF',
    surface: '#FFFFFF',
    surface2: '#F0F0F5',
    surface3: '#E7E7EF',
    border: 'rgba(20,20,40,0.08)',
    borderStrong: 'rgba(20,20,40,0.16)',
    text: '#17171C',
    textSub: '#5D5D6B',
    textFaint: '#9B9BA8',
    accent: '#6D5EF3',
    accentSoft: 'rgba(109,94,243,0.10)',
    accent2: '#0FB5D8',
    onAccent: '#FFFFFF',
    danger: '#E5484D',
    dangerSoft: 'rgba(229,72,77,0.10)',
    success: '#30A46C',
    warning: '#E6982E',
    userBubbleFrom: '#6D5EF3',
    userBubbleTo: '#4E7BEC',
    tabBar: 'rgba(255,255,255,0.88)',
    backdrop: 'rgba(20,20,40,0.35)',
    reasoningBg: 'rgba(109,94,243,0.06)',
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

export const monoFont = {
  fontFamily: undefined,
};

export interface ResolvedTheme {
  scheme: Scheme;
  colors: ThemeColors;
  /** base font size for chat message text */
  msgFontSize: number;
}

interface ThemeContextValue extends ResolvedTheme {}

const ThemeContext = createContext<ThemeContextValue>({
  scheme: 'dark',
  colors: themes.dark,
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
