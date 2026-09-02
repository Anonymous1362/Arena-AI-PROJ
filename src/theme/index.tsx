import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useSettingsStore, type AccentId } from '@/src/store/settings';

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
  successSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  userBubbleFrom: string;
  userBubbleTo: string;
  tabBar: string;
  backdrop: string;
  reasoningBg: string;
  termBg: string;
  termText: string;
  termAccent: string;
  /** Distinct hues for data viz / section chrome so screens stop looking mono. */
  chart: [string, string, string, string, string];
}

/* ------------------------------- accent families ---------------------------- */

export interface AccentFamily {
  id: AccentId;
  name: string;
  light: { accent: string; accent2: string; bubble: [string, string] };
  dark: { accent: string; accent2: string; bubble: [string, string] };
  swatch: string;
}

export const ACCENTS: AccentFamily[] = [
  {
    id: 'copper',
    name: 'Copper',
    swatch: '#C15F3C',
    light: { accent: '#C15F3C', accent2: '#8A857A', bubble: ['#C15F3C', '#A94E2F'] },
    dark: { accent: '#D97757', accent2: '#9A958A', bubble: ['#C15F3C', '#A94E2F'] },
  },
  {
    id: 'ember',
    name: 'Ember',
    swatch: '#D9482B',
    light: { accent: '#C0392B', accent2: '#8C7A72', bubble: ['#D9482B', '#A32E1B'] },
    dark: { accent: '#F0654A', accent2: '#9C8C84', bubble: ['#D9482B', '#A32E1B'] },
  },
  {
    id: 'cobalt',
    name: 'Cobalt',
    swatch: '#2F5FD0',
    light: { accent: '#2F5FD0', accent2: '#7C8496', bubble: ['#3B6FE0', '#25489B'] },
    dark: { accent: '#6E9BFF', accent2: '#8B93A6', bubble: ['#3B6FE0', '#25489B'] },
  },
  {
    id: 'forest',
    name: 'Forest',
    swatch: '#2E7D52',
    light: { accent: '#2E7D52', accent2: '#7B8A7E', bubble: ['#37905F', '#22603E'] },
    dark: { accent: '#5CBF86', accent2: '#8A9A8E', bubble: ['#37905F', '#22603E'] },
  },
  {
    id: 'violet',
    name: 'Violet',
    swatch: '#6B4FD8',
    light: { accent: '#6B4FD8', accent2: '#837D96', bubble: ['#7A5CE8', '#4E36A8'] },
    dark: { accent: '#A48CFF', accent2: '#918BA6', bubble: ['#7A5CE8', '#4E36A8'] },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    swatch: '#4A4A48',
    light: { accent: '#3E3E3B', accent2: '#85837C', bubble: ['#4A4A48', '#2C2C2A'] },
    dark: { accent: '#D6D2C6', accent2: '#949086', bubble: ['#5A5A56', '#33332F'] },
  },
];

export const accentFamily = (id: AccentId): AccentFamily =>
  ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];

/* --------------------------------- base neutrals ---------------------------- */

/** Warm, editorial, professional. Light is the signature; dark is warm charcoal. */
const NEUTRALS: Record<Scheme, Omit<ThemeColors, 'accent' | 'accentSoft' | 'accent2' | 'userBubbleFrom' | 'userBubbleTo' | 'onAccent'>> = {
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
    danger: '#B3261E',
    dangerSoft: 'rgba(179,38,30,0.08)',
    success: '#2F7A46',
    successSoft: 'rgba(47,122,70,0.10)',
    warning: '#B07C22',
    warningSoft: 'rgba(176,124,34,0.12)',
    info: '#2F5FD0',
    infoSoft: 'rgba(47,95,208,0.10)',
    tabBar: 'rgba(240,238,230,0.9)',
    backdrop: 'rgba(31,30,27,0.32)',
    reasoningBg: 'rgba(138,133,122,0.09)',
    termBg: '#26241F',
    termText: '#E8E4D8',
    termAccent: '#8FD18A',
    chart: ['#C15F3C', '#2F5FD0', '#2E7D52', '#B07C22', '#6B4FD8'],
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
    danger: '#E5664F',
    dangerSoft: 'rgba(229,102,79,0.12)',
    success: '#5BA367',
    successSoft: 'rgba(91,163,103,0.14)',
    warning: '#D19A3D',
    warningSoft: 'rgba(209,154,61,0.14)',
    info: '#7FA6FF',
    infoSoft: 'rgba(127,166,255,0.14)',
    tabBar: 'rgba(25,24,23,0.88)',
    backdrop: 'rgba(0,0,0,0.5)',
    reasoningBg: 'rgba(154,149,138,0.08)',
    termBg: '#111110',
    termText: '#E8E4D8',
    termAccent: '#8FD18A',
    chart: ['#D97757', '#7FA6FF', '#5CBF86', '#D19A3D', '#A48CFF'],
  },
};

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function buildColors(scheme: Scheme, accentId: AccentId): ThemeColors {
  const fam = accentFamily(accentId);
  const a = fam[scheme];
  return {
    ...NEUTRALS[scheme],
    accent: a.accent,
    accent2: a.accent2,
    accentSoft: withAlpha(a.accent, scheme === 'dark' ? 0.14 : 0.1),
    onAccent: accentId === 'graphite' && scheme === 'dark' ? '#191817' : '#FFFFFF',
    userBubbleFrom: a.bubble[0],
    userBubbleTo: a.bubble[1],
  };
}

/** Pre-built palettes — avoids allocating on every theme change. */
export const themes: Record<Scheme, ThemeColors> = {
  light: buildColors('light', 'copper'),
  dark: buildColors('dark', 'copper'),
};

/**
 * Tints used to give each settings section (and each tab) its own identity so
 * the app stops reading as one flat colour.
 */
export const SECTION_TINTS = {
  agent: '#C15F3C',
  models: '#2F5FD0',
  motion: '#6B4FD8',
  appearance: '#D9482B',
  generation: '#B07C22',
  context: '#2E7D52',
  github: '#4A4A48',
  shell: '#3E8E8A',
  usage: '#8A5CD1',
  data: '#B3261E',
  about: '#7C8496',
  providers: '#2F7FA8',
} as const;

export type SectionTint = keyof typeof SECTION_TINTS;

export const spacing = (n: number) => n * 4;

/**
 * Height of the floating tab bar row itself — the bar is absolutely positioned
 * over the scene, so anything docked to the bottom of a tab screen has to
 * reserve this much room (plus the bottom safe area) or it slides underneath.
 */
export const TAB_BAR_HEIGHT = 62;

/** Bottom clearance for UI docked inside a tab scene. */
export const tabBarClearance = (insetBottom: number) => TAB_BAR_HEIGHT + Math.max(insetBottom, 6);

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
  accentId: AccentId;
  /** base font size for chat message text */
  msgFontSize: number;
}

const ThemeContext = createContext<ResolvedTheme>({
  scheme: 'light',
  colors: themes.light,
  accentId: 'copper',
  msgFontSize: 15.5,
});

const cache = new Map<string, ThemeColors>();
function cached(scheme: Scheme, accent: AccentId): ThemeColors {
  const key = `${scheme}:${accent}`;
  let c = cache.get(key);
  if (!c) {
    c = buildColors(scheme, accent);
    cache.set(key, c);
  }
  return c;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = useSettingsStore((s) => s.appearance.theme);
  const msgSize = useSettingsStore((s) => s.appearance.messageTextSize);
  const accentId = useSettingsStore((s) => s.appearance.accent);
  const system = useColorScheme();

  const scheme: Scheme = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
  const msgFontSize = msgSize === 's' ? 14 : msgSize === 'l' ? 17 : 15.5;

  const value = useMemo<ResolvedTheme>(
    () => ({ scheme, colors: cached(scheme, accentId), accentId, msgFontSize }),
    [scheme, accentId, msgFontSize]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ResolvedTheme {
  return useContext(ThemeContext);
}
