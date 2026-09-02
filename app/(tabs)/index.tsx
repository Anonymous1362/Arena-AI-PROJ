import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, radius, spacing } from '@/src/theme';
import { Durations, enterStagger, isReducedMotion } from '@/src/theme/motion';
import { useChatsStore, selectSortedConversations, type Conversation } from '@/src/store/chats';
import { useSettingsStore } from '@/src/store/settings';
import { useStreamingStore } from '@/src/ai/session';
import { useHydrated } from '@/src/utils/hydration';
import { ConversationRow } from '@/src/components/ConversationRow';
import { EmptyState } from '@/src/components/EmptyState';
import { PressableScale } from '@/src/components/PressableScale';
import { Sheet } from '@/src/components/Sheet';
import { Button } from '@/src/components/ui';
import { ChatSurface } from '@/src/components/ChatSurface';
import { ChatLibrary } from '@/src/components/ChatLibrary';
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

/**
 * The Chat tab.
 *
 * It used to be a list you had to press "New" to escape. Now it *is* a chat:
 * the most recent (or newly drafted) conversation renders inline, the history
 * lives in a left-edge drawer, and "＋" starts a fresh one in place with a
 * cross-fade. Settings → Interaction can flip it back to list-first.
 */
export default function ChatTab() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const hydrated = useHydrated();

  const conversations = useChatsStore((s) => s.conversations);
  const createConversation = useChatsStore((s) => s.createConversation);
  const ensureDraft = useChatsStore((s) => s.ensureDraftConversation);
  const pruneDrafts = useChatsStore((s) => s.pruneEmptyDrafts);
  const deleteConversation = useChatsStore((s) => s.deleteConversation);
  const togglePin = useChatsStore((s) => s.togglePin);

  const activeModel = useSettingsStore((s) => s.activeModel);
  const onboarded = useSettingsStore((s) => s.onboarded);
  const setOnboarded = useSettingsStore((s) => s.setOnboarded);
  const chatFirst = useSettingsStore((s) => s.behavior.chatTabIsChat);
  const tabChatId = useSettingsStore((s) => s.tabChatId);
  const setTabChatId = useSettingsStore((s) => s.setTabChatId);
  const streamingIds = useStreamingStore((s) => s.ids);

  const [library, setLibrary] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [query, setQuery] = useState('');
  const pruned = useRef(false);

  const sorted = useMemo(() => selectSortedConversations(conversations), [conversations]);

  /* --------------------------- which chat is on screen -------------------------- */

  const validTabId = tabChatId && conversations.some((c) => c.id === tabChatId) ? tabChatId : null;
  const activeId = validTabId ?? sorted[0]?.id ?? null;

  // One tidy-up pass per cold start: drop leftover empty drafts, then make sure
  // there is always a conversation for the chat-first surface to render.
  useEffect(() => {
    if (!hydrated || pruned.current) return;
    pruned.current = true;
    const keep = tabChatId && conversations.some((c) => c.id === tabChatId) ? tabChatId : sorted[0]?.id ?? null;
    pruneDrafts(keep);
    if (!keep) {
      const draft = ensureDraft(useSettingsStore.getState().activeModel);
      setTabChatId(draft.id);
    } else if (!validTabId) {
      setTabChatId(keep);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useFocusEffect(
    useCallback(() => {
      if (hydrated && !useSettingsStore.getState().onboarded) setWelcome(true);
    }, [hydrated])
  );

  const newChat = useCallback(
    (prefill?: string) => {
      const conv = createConversation(useSettingsStore.getState().activeModel);
      setTabChatId(conv.id);
      haptics.press();
      if (prefill && !chatFirst) {
        router.push({ pathname: '/chat/[id]', params: { id: conv.id, prefill } });
      }
    },
    [chatFirst, createConversation, setTabChatId]
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
          if (activeId === conv.id) setTabChatId(null);
        },
      },
    ]);
  };

  /* --------------------------------- chat-first -------------------------------- */

  if (chatFirst) {
    const reduced = isReducedMotion();
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {activeId ? (
          <Animated.View
            key={activeId}
            style={{ flex: 1 }}
            entering={reduced ? undefined : FadeIn.duration(Durations.normal)}
            exiting={reduced ? undefined : FadeOut.duration(Durations.fast)}
          >
            <ChatSurface
              conversationId={activeId}
              embedded
              onOpenLibrary={() => setLibrary(true)}
              onNewChat={() => newChat()}
              onBack={() => setLibrary(true)}
            />
          </Animated.View>
        ) : (
          <View style={{ flex: 1, paddingTop: insets.top + spacing(4), paddingHorizontal: spacing(4) }}>
            <EmptyState engineReady={!!activeModel} onPick={(t) => newChat(t)} />
          </View>
        )}

        <ChatLibrary
          visible={library}
          onClose={() => setLibrary(false)}
          activeId={activeId}
          onOpen={(id) => setTabChatId(id)}
          onNewChat={() => newChat()}
        />

        <WelcomeSheet
          visible={welcome}
          onDone={() => {
            setWelcome(false);
            setOnboarded(true);
          }}
          onConnect={() => {
            setWelcome(false);
            setOnboarded(true);
            router.push('/providers');
          }}
        />
      </View>
    );
  }

  /* --------------------------------- list-first --------------------------------- */

  const q = query.trim().toLowerCase();
  const filtered = q
    ? sorted.filter(
        (c) => c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q))
      )
    : sorted;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing(4), paddingBottom: spacing(2), flexDirection: 'row', alignItems: 'center', gap: spacing(3) }}>
        <LinearGradient colors={[colors.userBubbleFrom, colors.userBubbleTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="sparkles" size={18} color="#FFF" />
        </LinearGradient>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4, flex: 1 }}>Copper</Text>
        <PressableScale haptic="press" onPress={() => newChat()}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accentSoft, borderRadius: radius.full, paddingHorizontal: spacing(3), paddingVertical: spacing(2) }}>
            <Ionicons name="add" size={16} color={colors.accent} />
            <Text style={{ color: colors.accent, fontSize: 13.5, fontWeight: '700' }}>New</Text>
          </View>
        </PressableScale>
      </View>

      {conversations.length > 0 ? (
        <View style={{ paddingHorizontal: spacing(4), paddingBottom: spacing(2) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.full, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: spacing(3.5), gap: 8 }}>
            <Ionicons name="search" size={16} color={colors.textFaint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search chats"
              placeholderTextColor={colors.textFaint}
              style={{ flex: 1, color: colors.text, fontSize: 14.5, paddingVertical: spacing(2.4) }}
              autoCorrect={false}
            />
            {query ? (
              <PressableScale haptic="none" scale={0.9} onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={16} color={colors.textFaint} />
              </PressableScale>
            ) : null}
          </View>
        </View>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: spacing(4), paddingBottom: spacing(28), flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 ? (
          q ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing(12) }}>
              <Ionicons name="search" size={28} color={colors.textFaint} />
              <Text style={{ color: colors.textSub, marginTop: spacing(3), fontSize: 14.5 }}>No chats match “{q}”</Text>
            </View>
          ) : (
            <EmptyState engineReady={!!activeModel} onPick={(t) => newChat(t)} />
          )
        ) : (
          filtered.map((item, i) => (
            <Animated.View
              key={item.id}
              entering={isReducedMotion() ? undefined : enterStagger(i, 18)}
              style={{
                backgroundColor: item.id === activeId && Platform.OS !== 'web' ? colors.accentSoft : undefined,
                borderRadius: radius.lg,
              }}
            >
              <ConversationRow
                conversation={item}
                streaming={!!streamingIds[item.id]}
                onPress={() => {
                  haptics.selection();
                  setTabChatId(item.id);
                  router.push({ pathname: '/chat/[id]', params: { id: item.id } });
                }}
                onDelete={() => confirmDelete(item)}
                onPin={() => togglePin(item.id)}
              />
            </Animated.View>
          ))
        )}
      </ScrollView>

      <WelcomeSheet
        visible={welcome}
        onDone={() => {
          setWelcome(false);
          setOnboarded(true);
        }}
        onConnect={() => {
          setWelcome(false);
          setOnboarded(true);
          router.push('/providers');
        }}
      />
    </View>
  );
}

/* --------------------------------- welcome ---------------------------------- */

function WelcomeSheet({ visible, onDone, onConnect }: { visible: boolean; onDone: () => void; onConnect: () => void }) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onDone} plain>
      <View style={{ paddingHorizontal: spacing(5), paddingTop: spacing(3) }}>
        <LinearGradient
          colors={[colors.userBubbleFrom, colors.userBubbleTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing(4) }}
        >
          <Ionicons name="sparkles" size={30} color="#FFF" />
        </LinearGradient>
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center', letterSpacing: -0.4 }}>
          Meet Copper
        </Text>
        <Text style={{ color: colors.textSub, fontSize: 14.5, textAlign: 'center', marginTop: spacing(1.5), marginBottom: spacing(6) }}>
          An agent that finishes the job. Bring your own model.
        </Text>
        <FeatureRow icon="hammer-outline" title="A real agent" sub="Plans steps, runs commands, reads & writes files — then verifies its work." />
        <FeatureRow icon="layers-outline" title="Any model you like" sub="Gemini (free tier), Claude, GPT, Grok, DeepSeek, OpenRouter, Ollama — your keys." />
        <FeatureRow icon="terminal-outline" title="Terminal & GitHub" sub="Built-in sandboxed shell plus a GitHub connector that commits to your repo." />
        <FeatureRow icon="lock-closed" title="Private by design" sub="Conversations and keys stay on this device. Nothing is tracked." />
        <View style={{ gap: spacing(2), marginTop: spacing(3), marginBottom: spacing(2) }}>
          <Button label="Get started" onPress={onDone} />
          <Button label="Connect a provider" variant="ghost" icon="cube-outline" onPress={onConnect} />
        </View>
      </View>
    </Sheet>
  );
}
