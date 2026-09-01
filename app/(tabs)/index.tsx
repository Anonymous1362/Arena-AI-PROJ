import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, radius, spacing } from '@/src/theme';
import { useChatsStore, selectSortedConversations, type Conversation } from '@/src/store/chats';
import { useSettingsStore } from '@/src/store/settings';
import { useStreamingStore } from '@/src/ai/session';
import { ConversationRow } from '@/src/components/ConversationRow';
import { EmptyState } from '@/src/components/EmptyState';
import { PressableScale } from '@/src/components/PressableScale';
import { Sheet } from '@/src/components/Sheet';
import { Button } from '@/src/components/ui';
import { haptics } from '@/src/utils/haptics';

function FeatureRow({ icon, title, sub }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing(3), alignItems: 'center', marginBottom: spacing(3) }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: colors.textSub, fontSize: 12.5, marginTop: 1 }}>{sub}</Text>
      </View>
    </View>
  );
}

export default function ChatsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const conversations = useChatsStore((s) => s.conversations);
  const createConversation = useChatsStore((s) => s.createConversation);
  const deleteConversation = useChatsStore((s) => s.deleteConversation);
  const togglePin = useChatsStore((s) => s.togglePin);
  const activeModel = useSettingsStore((s) => s.activeModel);
  const onboarded = useSettingsStore((s) => s.onboarded);
  const setOnboarded = useSettingsStore((s) => s.setOnboarded);
  const streamingIds = useStreamingStore((s) => s.ids);

  const sorted = useMemo(() => selectSortedConversations(conversations), [conversations]);
  const [welcome, setWelcome] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!useSettingsStore.getState().onboarded) setWelcome(true);
    }, [])
  );

  const newChat = useCallback(
    (prefill?: string) => {
      const conv = createConversation(useSettingsStore.getState().activeModel);
      haptics.medium();
      router.push({
        pathname: '/chat/[id]',
        params: prefill ? { id: conv.id, prefill } : { id: conv.id },
      });
    },
    [createConversation]
  );

  const confirmDelete = (conv: Conversation) => {
    Alert.alert('Delete chat?', `“${conv.title}” will be removed permanently.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          haptics.warning();
          deleteConversation(conv.id);
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* header */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing(4), paddingBottom: spacing(2), flexDirection: 'row', alignItems: 'center', gap: spacing(3) }}>
        <LinearGradient colors={[colors.userBubbleFrom, colors.userBubbleTo, colors.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="sparkles" size={18} color="#FFF" />
        </LinearGradient>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4, flex: 1 }}>Aurora</Text>
        <PressableScale haptic="medium" onPress={() => newChat()}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accentSoft, borderRadius: radius.full, paddingHorizontal: spacing(3), paddingVertical: spacing(2) }}>
            <Ionicons name="add" size={16} color={colors.accent} />
            <Text style={{ color: colors.accent, fontSize: 13.5, fontWeight: '700' }}>New</Text>
          </View>
        </PressableScale>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingHorizontal: spacing(4), paddingBottom: spacing(12), flexGrow: 1 }}
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            streaming={!!streamingIds[item.id]}
            onPress={() => {
              haptics.light();
              router.push({ pathname: '/chat/[id]', params: { id: item.id } });
            }}
            onDelete={() => confirmDelete(item)}
            onPin={() => togglePin(item.id)}
          />
        )}
        ListEmptyComponent={
          <EmptyState engineReady={!!activeModel} onPick={(t) => newChat(t)} />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* first-run welcome */}
      <Sheet visible={welcome} onClose={() => { setWelcome(false); setOnboarded(true); }} plain>
        <View style={{ paddingHorizontal: spacing(5), paddingTop: spacing(3) }}>
          <LinearGradient colors={[colors.userBubbleFrom, colors.userBubbleTo, colors.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing(4) }}>
            <Ionicons name="sparkles" size={30} color="#FFF" />
          </LinearGradient>
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center', letterSpacing: -0.4 }}>
            Meet Aurora
          </Text>
          <Text style={{ color: colors.textSub, fontSize: 14.5, textAlign: 'center', marginTop: spacing(1.5), marginBottom: spacing(6) }}>
            A private, offline-first AI chat. You choose the brain.
          </Text>
          <FeatureRow icon="hardware-chip-outline" title="Runs fully on-device" sub="Download compact AI models and chat with zero internet." />
          <FeatureRow icon="cloud-outline" title="Or bring any API" sub="OpenAI, Groq, OpenRouter, Ollama, LM Studio — your keys, your choice." />
          <FeatureRow icon="lock-closed" title="Private by design" sub="Conversations and keys stay on this device. Nothing is tracked." />
          <View style={{ gap: spacing(2), marginTop: spacing(3), marginBottom: spacing(2) }}>
            <Button label="Get started" onPress={() => { setWelcome(false); setOnboarded(true); }} />
            <Button label="Set up a model first" variant="ghost" icon="cube-outline" onPress={() => { setWelcome(false); setOnboarded(true); router.push('/models'); }} />
          </View>
        </View>
      </Sheet>
    </View>
  );
}
