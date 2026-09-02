import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme, radius, spacing } from '@/src/theme';
import { useProjectsStore } from '@/src/store/projects';
import { useChatsStore } from '@/src/store/chats';
import { PressableScale } from '@/src/components/PressableScale';
import { Button, TextField } from '@/src/components/ui';
import { Sheet } from '@/src/components/Sheet';
import { Folder, Plus } from '@/src/components/Icons';

export default function ProjectsScreen() {
  const { colors } = useTheme(); const insets = useSafeAreaInsets(); const router = useRouter();
  const projects = useProjectsStore((s) => s.projects); const create = useProjectsStore((s) => s.createProject);
  const conversations = useChatsStore((s) => s.conversations); const setProject = useChatsStore((s) => s.setConversationProject);
  const [newOpen, setNewOpen] = useState(false); const [name, setName] = useState('');
  const [assign, setAssign] = useState<string | null>(null);
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <View style={{ paddingTop: insets.top + spacing(4), paddingHorizontal: spacing(5), paddingBottom: spacing(3), flexDirection: 'row', alignItems: 'center' }}><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontSize: 28, fontWeight: '800' }}>Projects</Text><Text style={{ color: colors.textFaint, marginTop: 4 }}>Keep chats and artifacts together.</Text></View><PressableScale onPress={() => setNewOpen(true)}><View style={{ backgroundColor: colors.accent, borderRadius: 99, padding: 10 }}><Plus size={20} color={colors.onAccent}/></View></PressableScale></View>
    <ScrollView contentContainerStyle={{ padding: spacing(4), paddingBottom: 110, gap: spacing(3) }}>
      {!projects.length ? <View style={[styles.empty, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}><Folder size={32} color={colors.accent}/><Text style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}>A home for every build</Text><Text style={{ color: colors.textFaint, textAlign: 'center' }}>Create a project, then group related chats and generated files.</Text><Button label="New project" onPress={() => setNewOpen(true)}/></View> : projects.map((p) => { const chats = conversations.filter((c) => c.projectId === p.id); return <View key={p.id} style={[styles.card, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Folder size={20} color={colors.accent}/><Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, flex: 1 }}>{p.name}</Text><Text style={{ color: colors.textFaint, fontSize: 12 }}>{chats.length} chats</Text></View>{chats.map((c) => <PressableScale key={c.id} onPress={() => router.push(`/chat/${c.id}`)}><Text numberOfLines={1} style={{ color: colors.textSub, paddingVertical: 8 }}>↳ {c.title}</Text></PressableScale>)}<Button label="Add existing chat" variant="ghost" onPress={() => setAssign(p.id)}/></View>; })}
    </ScrollView>
    <Sheet visible={newOpen} onClose={() => setNewOpen(false)} title="New project"><View style={{ padding: spacing(4), gap: spacing(3) }}><TextField value={name} onChangeText={setName} placeholder="Project name" autoFocus/><Button label="Create project" onPress={() => { if (name.trim()) create(name); setName(''); setNewOpen(false); }}/></View></Sheet>
    <Sheet visible={!!assign} onClose={() => setAssign(null)} title="Add a chat"><ScrollView style={{ paddingHorizontal: spacing(4) }}>{conversations.map((c) => <PressableScale key={c.id} onPress={() => { setProject(c.id, assign!); setAssign(null); }}><Text style={{ color: colors.text, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>{c.title}</Text></PressableScale>)}</ScrollView></Sheet>
  </View>;
}
const styles = StyleSheet.create({ empty: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing(8), alignItems: 'center', gap: spacing(3), marginTop: spacing(8) }, card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing(4), gap: spacing(2) } });
