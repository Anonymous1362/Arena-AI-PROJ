import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Live usage tracking: rolling windows (1h / 24h), token accounting and
 * per-provider breakdown. Requests are recorded with timestamps so windowed
 * counts are true rolling windows, not fixed buckets.
 */

export interface UsageEvent {
  /** epoch ms */
  t: number;
  /** provider profile id */
  p: string;
  /** model id */
  m: string;
  tin: number;
  tout: number;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MAX_EVENTS = 500;

interface UsageState {
  events: UsageEvent[];
  totals: { requests: number; tokensIn: number; tokensOut: number };
  limits: { hour: number; day: number };
  record: (e: { profileId: string; model: string; tokensIn?: number; tokensOut?: number }) => void;
  setLimits: (patch: Partial<{ hour: number; day: number }>) => void;
  reset: () => void;
}

export const useUsageStore = create<UsageState>()(
  persist(
    (set) => ({
      events: [],
      totals: { requests: 0, tokensIn: 0, tokensOut: 0 },
      limits: { hour: 30, day: 300 },

      record: ({ profileId, model, tokensIn = 0, tokensOut = 0 }) => {
        set((s) => {
          const now = Date.now();
          const pruned = s.events.filter((e) => now - e.t < 2 * DAY);
          const next: UsageEvent[] = [
            ...pruned,
            { t: now, p: profileId, m: model, tin: tokensIn, tout: tokensOut },
          ].slice(-MAX_EVENTS);
          return {
            events: next,
            totals: {
              requests: s.totals.requests + 1,
              tokensIn: s.totals.tokensIn + tokensIn,
              tokensOut: s.totals.tokensOut + tokensOut,
            },
          };
        });
      },

      setLimits: (patch) => set((s) => ({ limits: { ...s.limits, ...patch } })),

      reset: () =>
        set({
          events: [],
          totals: { requests: 0, tokensIn: 0, tokensOut: 0 },
          limits: { hour: 30, day: 300 },
        }),
    }),
    {
      name: 'copper/usage/v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    }
  )
);

/* -------------------------------- summaries -------------------------------- */

export interface UsageSummary {
  hourReq: number;
  dayReq: number;
  dayTokens: number;
  todayTokens: number;
  /** 24 hourly buckets, oldest → newest (request counts). */
  buckets24: number[];
  /** 7 daily buckets of tokens, oldest → newest. */
  days7: number[];
  /** per-provider totals in the 24h window. */
  perProvider: { key: string; requests: number; tokens: number }[];
}

export function summarizeUsage(events: UsageEvent[], now = Date.now()): UsageSummary {
  const in24 = events.filter((e) => now - e.t < DAY);
  const in1h = in24.filter((e) => now - e.t < HOUR);

  const buckets24 = new Array(24).fill(0);
  for (const e of in24) {
    const hoursAgo = Math.floor((now - e.t) / HOUR);
    buckets24[23 - Math.min(23, hoursAgo)] += 1;
  }

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  let todayTokens = 0;
  const days7 = new Array(7).fill(0);
  for (let i = 0; i < 7; i++) {
    const dayStart = new Date(now - i * DAY);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = dayStart.getTime() + DAY;
    days7[6 - i] = events
      .filter((e) => e.t >= dayStart.getTime() && e.t < dayEnd)
      .reduce((n, e) => n + e.tin + e.tout, 0);
  }
  todayTokens = events
    .filter((e) => e.t >= startOfToday.getTime())
    .reduce((n, e) => n + e.tin + e.tout, 0);

  const byProvider = new Map<string, { requests: number; tokens: number }>();
  for (const e of in24) {
    const cur = byProvider.get(e.p) ?? { requests: 0, tokens: 0 };
    cur.requests += 1;
    cur.tokens += e.tin + e.tout;
    byProvider.set(e.p, cur);
  }

  return {
    hourReq: in1h.length,
    dayReq: in24.length,
    dayTokens: in24.reduce((n, e) => n + e.tin + e.tout, 0),
    todayTokens,
    buckets24,
    days7,
    perProvider: [...byProvider.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.tokens - a.tokens),
  };
}
