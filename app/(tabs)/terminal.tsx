import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, radius, spacing } from '@/src/theme';
import { useChatsStore } from '@/src/store/chats';
import { ToolEventCard } from '@/src/components/AgentPanels';
import { Terminal } from '@/src/components/Icons';
import { executorStatus } from '@/src/agent/tools';

export default function TerminalScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const conversations = useChatsStore((s) => s.conversations);
  const events = useMemo(() => conversations.flatMap((c) => c.messages.flatMap((m) => (m.toolEvents ?? []).filter((e) => e.kind === 'command').map((event) => ({ event, chat: c.title })))).sort((a, b) => b.event.ts - a.event.ts), [conversations]);
  const native = executorStatus() === 'native';
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <View style={{ paddingTop: insets.top + spacing(4), paddingHorizontal: spacing(5), paddingBottom: spacing(3) }}>
      <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800' }}>Terminal</Text>
      <Text style={{ color: colors.textFaint, marginTop: 4 }}>{native ? 'copper-exec · native shell' : 'sandboxed built-ins'} · command history</Text>
    </View>
    <ScrollView contentContainerStyle={{ padding: spacing(4), paddingBottom: 110, gap: spacing(3) }}>
      {!events.length ? <View style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.bgElevated }]}><Terminal size={28} color={colors.accent}/><Text style={{ color: colors.text, fontWeight: '700' }}>No commands yet</Text><Text style={{ color: colors.textFaint, textAlign: 'center' }}>Commands run by the agent appear here with output and exit status.</Text></View> : events.map(({ event, chat }) => <View key={event.id}><Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 11, marginBottom: 5 }}>{chat}</Text><ToolEventCard ev={event}/></View>)}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({ empty: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing(8), alignItems: 'center', gap: spacing(2), marginTop: spacing(8) } });
