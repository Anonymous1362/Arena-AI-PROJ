import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, radius, spacing } from '@/src/theme';
import { useUsageStore, summarizeUsage } from '@/src/store/usage';
import { useChatsStore } from '@/src/store/chats';
import { useSettingsStore } from '@/src/store/settings';
import { AppHeader } from '@/src/components/AppHeader';
import { Card, Stepper } from '@/src/components/ui';
import { Gauge, Clock, Bolt, Coins, Message as MessageIcon } from '@/src/components/Icons';

function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.tileIcon, { backgroundColor: colors.accentSoft }]}>
        {icon}
      </View>
      <Text style={{ color: colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: spacing(2) }}>
        {label}
      </Text>
      <Text style={{ color: colors.text, fontSize: 19, fontWeight: '800', marginTop: 2, fontVariant: ['tabular-nums'] as never }}>
        {value}
      </Text>
      {sub ? <Text style={{ color: colors.textFaint, fontSize: 11.5, marginTop: 1 }}>{sub}</Text> : null}
    </View>
  );
}

function MiniBar({
  values,
  color,
  track,
  height = 56,
}: {
  values: number[];
  color: string;
  track: string;
  height?: number;
}) {
  const max = Math.max(1, ...values);
  const gap = 3;
  const width = 100;
  const barW = (width - gap * (values.length - 1)) / values.length;
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {values.map((v, i) => {
        const h = v === 0 ? 2 : Math.max(4, (v / max) * (height - 2));
        return (
          <Rect
            key={i}
            x={i * (barW + gap)}
            y={height - h}
            width={barW}
            height={h}
            rx={2}
            fill={v === 0 ? track : color}
          />
        );
      })}
    </Svg>
  );
}

function UsageBar({ used, limit, color, track }: { used: number; limit: number; color: string; track: string }) {
  const frac = Math.min(1, used / Math.max(1, limit));
  const hot = frac > 0.85;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: track, overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(frac * 100)}%`, height: '100%', borderRadius: 4, backgroundColor: hot ? '#B3261E' : color }} />
      </View>
    </View>
  );
}

export default function UsageScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const events = useUsageStore((s) => s.events);
  const totals = useUsageStore((s) => s.totals);
  const limits = useUsageStore((s) => s.limits);
  const setLimits = useUsageStore((s) => s.setLimits);
  const profiles = useSettingsStore((s) => s.profiles);
  const conversations = useChatsStore((s) => s.conversations);

  const summary = useMemo(() => summarizeUsage(events), [events]);
  const messageCount = conversations.reduce((n, c) => n + c.messages.length, 0);

  const providerName = (key: string) => profiles.find((p) => p.id === key)?.name ?? key.slice(0, 12);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Usage & limits" subtitle="Tracked on-device, resets never unless you say so" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(8) }}>
        {/* headline stats */}
        <View style={{ flexDirection: 'row', gap: spacing(2.5) }}>
          <View style={{ flex: 1 }}>
            <StatTile icon={<Gauge size={16} />} label="Last hour" value={String(summary.hourReq)} sub={`limit ${limits.hour}`} />
          </View>
          <View style={{ flex: 1 }}>
            <StatTile icon={<Clock size={16} />} label="Rolling 24h" value={String(summary.dayReq)} sub={`limit ${limits.day}`} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing(2.5), marginTop: spacing(2.5) }}>
          <View style={{ flex: 1 }}>
            <StatTile icon={<Coins size={16} />} label="Tokens today" value={formatTokens(summary.todayTokens)} sub={`${formatTokens(summary.dayTokens)} in 24h`} />
          </View>
          <View style={{ flex: 1 }}>
            <StatTile icon={<MessageIcon size={16} />} label="Chats" value={String(conversations.length)} sub={`${messageCount} messages`} />
          </View>
        </View>

        {/* rolling window bars */}
        <Card style={{ marginTop: spacing(5) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing(2) }}>
            <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '800' }}>Rate-limit window</Text>
            <Text style={{ color: colors.textFaint, fontSize: 12.5, fontWeight: '600' }}>
              {summary.hourReq}/{limits.hour} · 1h
            </Text>
          </View>
          <UsageBar used={summary.hourReq} limit={limits.hour} color={colors.accent} track={colors.surface3} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing(3), marginBottom: spacing(2) }}>
            <Text style={{ color: colors.textFaint, fontSize: 12.5, fontWeight: '600' }}>Rolling 24h</Text>
            <Text style={{ color: colors.textFaint, fontSize: 12.5, fontWeight: '600' }}>
              {summary.dayReq}/{limits.day}
            </Text>
          </View>
          <UsageBar used={summary.dayReq} limit={limits.day} color={colors.accent} track={colors.surface3} />
          <View style={{ marginTop: spacing(2) }}>
            <Stepper label="Hourly soft limit" value={limits.hour} step={5} min={5} max={500} onChange={(v) => setLimits({ hour: v })} />
            <Stepper label="Daily soft limit" value={limits.day} step={25} min={25} max={5000} onChange={(v) => setLimits({ day: v })} />
          </View>
        </Card>

        {/* activity charts */}
        <Card style={{ marginTop: spacing(4) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '800' }}>Requests · last 24h</Text>
            <Bolt size={15} color={colors.textFaint} />
          </View>
          <View style={{ marginTop: spacing(3) }}>
            <MiniBar values={summary.buckets24} color={colors.accent} track={colors.surface3} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing(1.5) }}>
            <Text style={{ color: colors.textFaint, fontSize: 11 }}>24h ago</Text>
            <Text style={{ color: colors.textFaint, fontSize: 11 }}>now</Text>
          </View>

          <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '800', marginTop: spacing(5) }}>
            Tokens · last 7 days
          </Text>
          <View style={{ marginTop: spacing(3) }}>
            <MiniBar values={summary.days7} color={colors.accent2} track={colors.surface3} height={64} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing(1.5) }}>
            <Text style={{ color: colors.textFaint, fontSize: 11 }}>7d ago</Text>
            <Text style={{ color: colors.textFaint, fontSize: 11 }}>today</Text>
          </View>
        </Card>

        {/* per-provider */}
        <Card style={{ marginTop: spacing(4) }}>
          <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '800', marginBottom: spacing(2) }}>
            Providers · last 24h
          </Text>
          {summary.perProvider.length === 0 ? (
            <Text style={{ color: colors.textSub, fontSize: 13.5 }}>
              Nothing yet — send a message and watch it land here.
            </Text>
          ) : (
            summary.perProvider.map((p) => (
              <View key={p.key} style={{ paddingVertical: spacing(2), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '700' }}>{providerName(p.key)}</Text>
                  <Text style={{ color: colors.textSub, fontSize: 13, fontVariant: ['tabular-nums'] as never }}>
                    {p.requests} req · {formatTokens(p.tokens)} tok
                  </Text>
                </View>
              </View>
            ))
          )}
        </Card>

        {/* lifetime totals */}
        <Card style={{ marginTop: spacing(4) }}>
          <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '800', marginBottom: spacing(2) }}>
            Lifetime
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(1.5) }}>
            <Text style={{ color: colors.textSub, fontSize: 13.5 }}>Requests</Text>
            <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '700', fontVariant: ['tabular-nums'] as never }}>
              {totals.requests.toLocaleString()}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(1.5) }}>
            <Text style={{ color: colors.textSub, fontSize: 13.5 }}>Tokens in</Text>
            <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '700', fontVariant: ['tabular-nums'] as never }}>
              {totals.tokensIn.toLocaleString()}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(1.5) }}>
            <Text style={{ color: colors.textSub, fontSize: 13.5 }}>Tokens out</Text>
            <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '700', fontVariant: ['tabular-nums'] as never }}>
              {totals.tokensOut.toLocaleString()}
            </Text>
          </View>
        </Card>

        <Text style={{ color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: spacing(4), lineHeight: 18 }}>
          Counts every request Copper makes, including auto-titles.{'\n'}
          Stored only on this device.
        </Text>
      </ScrollView>
    </View>
  );
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing(3.4),
  },
  tileIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
