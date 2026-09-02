import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, radius, spacing, tabBarClearance } from '@/src/theme';
import { Durations, Ease, enterMessage, isReducedMotion } from '@/src/theme/motion';
import { useChatsStore, type ChatMessage, type MessageAttachment } from '@/src/store/chats';
import { useSettingsStore, type ThinkingLevel } from '@/src/store/settings';
import { consumeNoModel, onNoModel, sendMessage, stopGeneration, useStreamingStore } from '@/src/ai/session';
import { compactConversation, contextUsageFor } from '@/src/ai/context';
import { THINKING_LEVELS, modelMeta, supportedThinkingLevels, thinkingLabel } from '@/src/ai/catalog';
import { MessageBubble } from '@/src/components/MessageBubble';
import { Composer } from '@/src/components/Composer';
import { ModelSheet } from '@/src/components/ModelSheet';
import { ModelPill } from '@/src/components/ModelPill';
import { Sheet } from '@/src/components/Sheet';
import { PromptLibrarySheet } from '@/src/components/PromptLibrarySheet';
import { PressableScale } from '@/src/components/PressableScale';
import { Banner, Button, Segmented, SwitchRow, TextField } from '@/src/components/ui';
import { EmptyState } from '@/src/components/EmptyState';
import { ConfirmSheet } from '@/src/components/ConfirmSheet';
import { ContextMeter } from '@/src/components/ContextMeter';
import { speakAloud, stopSpeaking } from '@/src/utils/speech';
import { haptics } from '@/src/utils/haptics';
import { shareJson } from '@/src/utils/share';
import { exportConversationMarkdown } from '@/src/utils/exportMarkdown';
import { dismissKeyboardIfEnabled, useKeyboardInset } from '@/src/utils/keyboard';

async function pickImageAttachment(): Promise<MessageAttachment[] | null> {
  const DocumentPicker = await import('expo-document-picker');
  const res = await DocumentPicker.getDocumentAsync({
    type: ['image/jpeg', 'image/png', 'image/webp'],
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return [{ kind: 'image', uri: a.uri, mime: a.mimeType ?? 'image/jpeg', name: a.name }];
}

function SheetAction({
  icon,
  label,
  sublabel,
  danger,
  tint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  danger?: boolean;
  tint?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const c = danger ? colors.danger : tint ?? colors.text;
  return (
    <PressableScale haptic="select" scale={0.98} onPress={onPress}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing(3),
          paddingVertical: spacing(3.2),
          paddingHorizontal: spacing(2),
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: danger ? colors.dangerSoft : colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={17} color={c} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: danger ? colors.danger : colors.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
          {sublabel ? (
            <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 12, marginTop: 1 }}>
              {sublabel}
            </Text>
          ) : null}
        </View>
      </View>
    </PressableScale>
  );
}

export interface ChatSurfaceProps {
  conversationId: string;
  /** Inside the Chat tab: no back button, shows the library + new-chat buttons. */
  embedded?: boolean;
  onBack?: () => void;
  onOpenLibrary?: () => void;
  onNewChat?: () => void;
  /** Text pre-loaded into the composer (deep links, empty-state suggestions). */
  initialText?: string;
}

/**
 * The conversation surface, shared by the Chat tab (embedded) and the pushed
 * `/chat/[id]` route. Keeping it in one component is what lets the Chat tab be
 * an actual chat instead of a list you have to tap "New" to escape.
 *
 * Keyboard handling: the composer rides a UI-thread `translateY` driven by the
 * real IME frame (see `useKeyboardInset`), so it never gets covered and never
 * fights `adjustResize` on edge-to-edge Android. The list gets matching bottom
 * padding once the keyboard settles, and everything scrolls to the newest line.
 */
export function ChatSurface({ conversationId, embedded, onBack, onOpenLibrary, onNewChat, initialText }: ChatSurfaceProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const msgFontSize = useTheme().msgFontSize;

  const conv = useChatsStore((s) => s.conversations.find((c) => c.id === conversationId));
  const deleteMessage = useChatsStore((s) => s.deleteMessage);
  const renameConversation = useChatsStore((s) => s.renameConversation);
  const togglePin = useChatsStore((s) => s.togglePin);
  const setConversationModel = useChatsStore((s) => s.setConversationModel);
  const setConversationSystemPrompt = useChatsStore((s) => s.setConversationSystemPrompt);
  const clearCompaction = useChatsStore((s) => s.clearCompaction);

  const sendOnEnter = useSettingsStore((s) => s.behavior.sendOnEnter);
  const globalSystemPrompt = useSettingsStore((s) => s.generation.systemPrompt);
  const thinking = useSettingsStore((s) => s.generation.thinking);
  const showThinking = useSettingsStore((s) => s.generation.showThinking);
  const patchGeneration = useSettingsStore((s) => s.patchGeneration);
  const streaming = useStreamingStore((s) => !!s.ids[conversationId]);

  const [modelSheet, setModelSheet] = useState(false);
  const [menuSheet, setMenuSheet] = useState(false);
  const [thinkSheet, setThinkSheet] = useState(false);
  const [renameSheet, setRenameSheet] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [editSheet, setEditSheet] = useState(false);
  const [editText, setEditText] = useState('');
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [actionsMsg, setActionsMsg] = useState<ChatMessage | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [sysPromptSheet, setSysPromptSheet] = useState(false);
  const [sysPromptText, setSysPromptText] = useState('');
  const [summarySheet, setSummarySheet] = useState(false);
  const [promptLibSheet, setPromptLibSheet] = useState(false);
  const [promptLibTarget, setPromptLibTarget] = useState<'override' | 'composer'>('composer');
  const [atBottom, setAtBottom] = useState(true);
  const composerPrefillRef = useRef<((text: string) => void) | null>(null);
  const listRef = useRef<ScrollView | null>(null);

  const kb = useKeyboardInset();
  const scrollY = useSharedValue(0);

  const messages = conv?.messages ?? [];
  const lastMessage = messages[messages.length - 1];

  /* ------------------------------- focus plumbing ------------------------------ */

  // Leaving the screen must not drag the keyboard along with you.
  useFocusEffect(
    useCallback(() => {
      return () => dismissKeyboardIfEnabled();
    }, [])
  );

  // Nudge into the model picker when sending with no model configured.
  useEffect(() => {
    return onNoModel((convId) => {
      if (convId !== conversationId) return;
      consumeNoModel(convId);
      setBanner('Connect a model first — pick one from the header.');
      setModelSheet(true);
    });
  }, [conversationId]);

  /* --------------------------------- auto read -------------------------------- */

  const autoRead = useSettingsStore((s) => s.agentScope.autoReadAloud);
  const lastSpokenRef = useRef<string | null>(null);
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (!autoRead) return;
    if (streaming) {
      wasStreamingRef.current = true;
      return;
    }
    if (
      wasStreamingRef.current &&
      lastMessage?.role === 'assistant' &&
      lastMessage.done &&
      lastMessage.content &&
      lastSpokenRef.current !== lastMessage.id
    ) {
      lastSpokenRef.current = lastMessage.id;
      speakAloud(lastMessage.content, lastMessage.id);
    }
    wasStreamingRef.current = false;
  }, [streaming, autoRead, lastMessage]);

  /* ---------------------------------- actions --------------------------------- */

  const send = useCallback(
    (text: string, attachments: MessageAttachment[] = []) => {
      setBanner(null);
      haptics.send();
      sendMessage(conversationId, { text, attachments }).catch((e: Error) => setBanner(e.message));
    },
    [conversationId]
  );

  const retry = useCallback(() => {
    if (!conv) return;
    const last = conv.messages[conv.messages.length - 1];
    if (last?.role === 'assistant') deleteMessage(conv.id, last.id);
    sendMessage(conversationId, { regenerate: true }).catch((e: Error) => setBanner(e.message));
  }, [conv, deleteMessage, conversationId]);

  const onEditSave = useCallback(() => {
    if (!editingMsg) return;
    const text = editText.trim();
    setEditSheet(false);
    if (text) {
      sendMessage(conversationId, { editMessageId: editingMsg.id, text }).catch((e: Error) => setBanner(e.message));
    }
    setEditingMsg(null);
  }, [editText, editingMsg, conversationId]);

  const exportChat = useCallback(async () => {
    if (!conv) return;
    try {
      await shareJson(`copper-chat-${conv.title.replace(/[^\w-]+/g, '_').slice(0, 32) || 'chat'}.json`, {
        app: 'copper',
        kind: 'conversation',
        exportedAt: new Date().toISOString(),
        conversation: conv,
      });
    } catch (e) {
      setBanner(`Export failed: ${(e as Error).message}`);
    }
  }, [conv]);

  const exportMarkdown = useCallback(async () => {
    if (!conv) return;
    try {
      await exportConversationMarkdown(conv);
    } catch (e) {
      setBanner(`Export failed: ${(e as Error).message}`);
    }
  }, [conv]);

  const openSysPromptSheet = useCallback(() => {
    setSysPromptText(conv?.systemPromptOverride ?? globalSystemPrompt ?? '');
    setMenuSheet(false);
    setTimeout(() => setSysPromptSheet(true), Durations.smooth);
  }, [conv, globalSystemPrompt]);

  const saveSysPrompt = useCallback(() => {
    const val = sysPromptText.trim();
    setConversationSystemPrompt(conversationId, val || undefined);
    haptics.success();
    setSysPromptSheet(false);
  }, [conversationId, setConversationSystemPrompt, sysPromptText]);

  const handlePromptLibrarySelect = useCallback(
    (body: string) => {
      if (promptLibTarget === 'override') setSysPromptText(body);
      else composerPrefillRef.current?.(body);
    },
    [promptLibTarget]
  );

  const scrollToBottom = useCallback(
    (animated = true) => {
      const node = listRef.current;
      if (!node) return;
      node.scrollToEnd({ animated });
      setAtBottom(true);
    },
    []
  );

  // Keep the newest line in view while streaming, and lift above the keyboard.
  useEffect(() => {
    if (kb.visible) {
      const t = setTimeout(() => scrollToBottom(true), 60);
      return () => clearTimeout(t);
    }
  }, [kb.visible, scrollToBottom]);

  const hasOverride = !!conv?.systemPromptOverride;
  const modelName = conv?.model?.model ?? '';
  const meta = modelMeta(modelName);
  const levels = supportedThinkingLevels(modelName);
  const prompt = conv?.systemPromptOverride ?? globalSystemPrompt ?? '';
  const usage = useMemo(() => contextUsageFor(conv, prompt), [conv, prompt]);

  const menuActions = useMemo(
    () => (
      <>
        <SheetAction icon="pencil-outline" label="Rename" onPress={() => { setRenameText(conv?.title ?? ''); setMenuSheet(false); setTimeout(() => setRenameSheet(true), Durations.smooth); }} />
        <SheetAction icon={conv?.pinned ? 'pin' : 'pin-outline'} label={conv?.pinned ? 'Unpin' : 'Pin to top'} onPress={() => { togglePin(conversationId); setMenuSheet(false); }} />
        <SheetAction icon="sparkles-outline" label="Thinking level" sublabel={`${thinkingLabel(thinking)} · ${meta.family}`} tint={colors.chart[1]} onPress={() => { setMenuSheet(false); setTimeout(() => setThinkSheet(true), Durations.smooth); }} />
        <SheetAction icon="text-outline" label="System prompt" sublabel={hasOverride ? 'Override set for this chat' : 'Using global setting'} tint={colors.chart[2]} onPress={openSysPromptSheet} />
        <SheetAction icon="archive-outline" label="Compact context" sublabel={conv?.summary ? 'Re-summarise now' : `${Math.round(usage.pct * 100)}% of window used`} tint={colors.chart[3]} onPress={() => { setMenuSheet(false); void compactConversation(conversationId, { manual: true }).then((r) => { if (!r.ok) setBanner(r.error ?? 'Compaction failed.'); }); }} />
        <SheetAction icon="share-outline" label="Export chat (.json)" tint={colors.chart[4]} onPress={() => { setMenuSheet(false); exportChat(); }} />
        <SheetAction icon="document-text-outline" label="Export run log (.md)" tint={colors.chart[4]} onPress={() => { setMenuSheet(false); exportMarkdown(); }} />
        <SheetAction icon="cube-outline" label="Change model" tint={colors.chart[1]} onPress={() => { setMenuSheet(false); setModelSheet(true); }} />
        {embedded && onNewChat ? (
          <SheetAction icon="add-circle-outline" label="New chat" tint={colors.accent} onPress={() => { setMenuSheet(false); onNewChat(); }} />
        ) : null}
        <SheetAction
          icon="refresh-outline"
          label="Clear messages"
          onPress={() => {
            setMenuSheet(false);
            if (!conv) return;
            for (const m of [...conv.messages]) deleteMessage(conv.id, m.id);
            clearCompaction(conv.id);
            haptics.warning();
          }}
        />
      </>
    ),
    [clearCompaction, colors, conv, conversationId, embedded, exportChat, exportMarkdown, hasOverride, meta.family, onNewChat, openSysPromptSheet, thinking, togglePin, deleteMessage, usage.pct]
  );

  /* --------------------------------- animations -------------------------------- */

  const composerLift = useAnimatedStyle(() => ({
    transform: [{ translateY: -kb.shared.get() }],
  }));

  const headerShadow = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [0, 24], [0, 1], 'clamp'),
  }));

  const progressLine = useAnimatedStyle(() => ({
    opacity: withTiming(streaming ? 1 : 0, { duration: Durations.fast }),
  }));

  const fabStyle = useAnimatedStyle(() => ({
    opacity: withTiming(atBottom ? 0 : 1, { duration: Durations.fast }),
    transform: [{ scale: withSpring(atBottom ? 0.6 : 1, { damping: 22, stiffness: 300 }) }],
  }));

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.set(e.contentOffset.y);
    },
  });

  const contentPad = kb.height + insets.bottom + 12 + spacing(4);

  if (!conv) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  const engineReady = !!conv.model || !!useSettingsStore.getState().activeModel;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* ─────────────────────────────── header ─────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: colors.bg }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }, headerShadow]} />
        <View style={styles.headerRow}>
          {embedded ? (
            <PressableScale haptic="navigate" onPress={onOpenLibrary} scale={0.9}>
              <View style={[styles.roundBtn, { backgroundColor: colors.surface2 }]}>
                <Ionicons name="albums-outline" size={19} color={colors.text} />
              </View>
            </PressableScale>
          ) : (
            <PressableScale haptic="navigate" onPress={onBack} scale={0.9}>
              <View style={[styles.roundBtn, { backgroundColor: colors.surface2 }]}>
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </View>
            </PressableScale>
          )}

          <PressableScale haptic="none" scale={0.98} onPress={() => { setRenameText(conv.title); setRenameSheet(true); }} style={{ flex: 1, marginHorizontal: spacing(2) }}>
            <View>
              <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: -0.2 }}>
                {conv.title}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <ModelPill model={conv.model} onPress={() => setModelSheet(true)} />
                {levels.length > 1 ? (
                  <PressableScale haptic="select" scale={0.92} onPress={() => setThinkSheet(true)}>
                    <View style={[styles.thinkChip, { backgroundColor: colors.infoSoft, borderColor: colors.info }]}>
                      <Ionicons name="sparkles" size={10} color={colors.info} />
                      <Text style={{ color: colors.info, fontSize: 10.5, fontWeight: '800' }}>
                        {thinkingLabel(thinking)}
                      </Text>
                    </View>
                  </PressableScale>
                ) : null}
              </View>
            </View>
          </PressableScale>

          <ContextMeter conversation={conv} />

          {embedded && onNewChat ? (
            <PressableScale haptic="press" onPress={onNewChat} scale={0.9}>
              <View style={[styles.roundBtn, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="add" size={20} color={colors.accent} />
              </View>
            </PressableScale>
          ) : null}

          <PressableScale haptic="navigate" onPress={() => setMenuSheet(true)} scale={0.9}>
            <View style={[styles.roundBtn, { backgroundColor: colors.surface2 }]}>
              <Ionicons name="ellipsis-horizontal" size={19} color={colors.text} />
            </View>
          </PressableScale>
        </View>

        {/* streaming hairline */}
        <Animated.View pointerEvents="none" style={[styles.progressTrack, progressLine]}>
          <StreamingBar color={colors.accent} active={streaming} />
        </Animated.View>
      </View>

      {/* ─────────────────────────────── messages ───────────────────────────── */}
      {banner ? (
        <View style={{ paddingHorizontal: spacing(4), paddingTop: spacing(2) }}>
          <Banner kind="warn" text={banner} onClose={() => setBanner(null)} actionLabel="Pick model" onAction={() => setModelSheet(true)} />
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        {messages.length === 0 ? (
          <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: contentPad }} showsVerticalScrollIndicator={false}>
            <EmptyState engineReady={engineReady} onPick={send} />
          </ScrollView>
        ) : (
          <Animated.ScrollView
            ref={listRef as React.Ref<any>}
            style={{ flex: 1 }}
            onScroll={onScroll}
            scrollEventThrottle={32}
            contentContainerStyle={{
              paddingHorizontal: spacing(4),
              paddingTop: spacing(3),
              paddingBottom: contentPad,
              flexGrow: 1,
              justifyContent: 'flex-end',
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            onContentSizeChange={() => {
              if (atBottom || streaming) listRef.current?.scrollToEnd({ animated: streaming });
            }}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={Platform.OS === 'android'}
            onScrollBeginDrag={() => setAtBottom(false)}
            onMomentumScrollEnd={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              setAtBottom(contentSize.height - contentOffset.y - layoutMeasurement.height < 80);
            }}
          >
            {conv.summary ? (
              <PressableScale haptic="select" scale={0.99} onPress={() => setSummarySheet(true)}>
                <Animated.View entering={enterMessage()} style={[styles.compactCard, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
                  <Ionicons name="archive-outline" size={16} color={colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.accent, fontSize: 12.5, fontWeight: '800' }}>
                      Context compacted · {conv.archivedCount ?? 0} earlier messages summarised
                    </Text>
                    <Text numberOfLines={1} style={{ color: colors.accent, fontSize: 11.5, opacity: 0.8, marginTop: 1 }}>
                      Tap to read the Project Summary State
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={colors.accent} />
                </Animated.View>
              </PressableScale>
            ) : null}

            {messages.map((m, i) => {
              const prev = i > 0 ? messages[i - 1] : null;
              const showDivider = !prev || m.createdAt - prev.createdAt > 5 * 60_000;
              return (
                <React.Fragment key={m.id}>
                  {showDivider ? <TimeDivider ts={m.createdAt} /> : null}
                  <Animated.View entering={enterMessage()}>
                    <MessageBubble
                      message={m}
                      fontSize={msgFontSize}
                      streaming={streaming && m === lastMessage && m.role === 'assistant'}
                      onLongPress={setActionsMsg}
                      onRetry={retry}
                    />
                  </Animated.View>
                </React.Fragment>
              );
            })}
          </Animated.ScrollView>
        )}

        {/* scroll-to-bottom */}
        <Animated.View pointerEvents={atBottom ? 'none' : 'box-none'} style={[styles.fabWrap, fabStyle]}>
          <PressableScale haptic="navigate" scale={0.88} onPress={() => scrollToBottom(true)}>
            <View style={[styles.fab, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="chevron-down" size={20} color={colors.text} />
            </View>
          </PressableScale>
        </Animated.View>
      </View>

      {/* ─────────────────────────────── composer ───────────────────────────── */}
      <Animated.View style={[{ backgroundColor: colors.bg }, composerLift]}>
        <View
          style={{
            paddingHorizontal: spacing(3),
            // In the Chat tab the floating tab bar sits *over* the scene, so
            // the composer has to clear it — otherwise the send button hides.
            paddingBottom: embedded ? tabBarClearance(insets.bottom) : Math.max(spacing(3), insets.bottom + 8),
            paddingTop: spacing(2),
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
          }}
        >
          <ComposerWithPromptLib
            streaming={streaming}
            sendOnEnter={sendOnEnter}
            onSend={send}
            onStop={() => stopGeneration(conversationId)}
            prefillRef={composerPrefillRef}
            initialText={initialText}
            onOpenPromptLib={() => {
              setPromptLibTarget('composer');
              setPromptLibSheet(true);
            }}
          />
        </View>
      </Animated.View>

      {/* ─────────────────────────────── overlays ───────────────────────────── */}
      <ModelSheet
        visible={modelSheet}
        onClose={() => setModelSheet(false)}
        current={conv.model}
        onPicked={(m) => setConversationModel(conversationId, m)}
      />

      <Sheet visible={menuSheet} onClose={() => setMenuSheet(false)} title="Chat options">
        <View style={{ paddingHorizontal: spacing(4) }}>{menuActions}</View>
      </Sheet>

      <Sheet visible={thinkSheet} onClose={() => setThinkSheet(false)} title="Thinking">
        <View style={{ paddingHorizontal: spacing(4), paddingBottom: spacing(2), gap: spacing(3) }}>
          <View style={[styles.noteBox, { backgroundColor: colors.surface2 }]}>
            <Text style={{ color: colors.textSub, fontSize: 12.5, lineHeight: 18 }}>
              {meta.thinking === 'gemini-level'
                ? `${meta.family} uses Gemini thinking levels. “Extended” is the app’s name for Google’s ` +
                  'high level — the deepest reasoning pass.'
                : meta.thinking === 'gemini-budget'
                  ? `${meta.family} uses a thinking budget (128 → 24,576 tokens) mapped from the same four levels.`
                  : meta.thinking === 'openai-effort'
                    ? `${meta.family} maps these onto reasoning_effort.`
                    : 'This model does not expose a reasoning control — the level is ignored.'}
            </Text>
          </View>

          <Segmented
            options={THINKING_LEVELS.filter((l) => (levels as string[]).includes(l.value)).map((l) => ({
              value: l.value,
              label: l.label,
            }))}
            value={thinking}
            onChange={(v: ThinkingLevel) => {
              haptics.toggle();
              patchGeneration({ thinking: v });
            }}
          />

          {THINKING_LEVELS.filter((l) => (levels as string[]).includes(l.value)).map((l) => (
            <Text key={l.value} style={{ color: colors.textFaint, fontSize: 11.5 }}>
              <Text style={{ color: colors.textSub, fontWeight: '700' }}>{l.label}</Text> — {l.note}
            </Text>
          ))}

          <View style={[styles.noteBox, { backgroundColor: colors.surface2 }]}>
            <SwitchRow
              label="Show thinking panel"
              hint="Stream the model’s thought summaries into a collapsible panel above each reply."
              value={showThinking}
              onChange={(v) => patchGeneration({ showThinking: v })}
            />
          </View>
          <Button label="Done" onPress={() => setThinkSheet(false)} />
        </View>
      </Sheet>

      <Sheet visible={renameSheet} onClose={() => setRenameSheet(false)} title="Rename chat">
        <View style={{ paddingHorizontal: spacing(4), paddingBottom: spacing(2) }}>
          <TextField
            value={renameText}
            onChangeText={setRenameText}
            placeholder="Chat name"
            autoFocus
            onSubmitEditing={() => {
              if (renameText.trim()) renameConversation(conversationId, renameText.trim());
              setRenameSheet(false);
            }}
          />
          <Button
            label="Save"
            onPress={() => {
              if (renameText.trim()) renameConversation(conversationId, renameText.trim());
              setRenameSheet(false);
            }}
          />
        </View>
      </Sheet>

      <Sheet visible={summarySheet} onClose={() => setSummarySheet(false)} title="Project Summary State" maxHeight="82%">
        <ScrollView style={{ paddingHorizontal: spacing(4) }} contentContainerStyle={{ paddingBottom: spacing(4) }}>
          <Text selectable style={{ color: colors.textSub, fontSize: 13, lineHeight: 20 }}>
            {conv.summary ?? '—'}
          </Text>
        </ScrollView>
      </Sheet>

      <Sheet visible={sysPromptSheet} onClose={() => setSysPromptSheet(false)} title="System prompt" maxHeight="88%">
        <View style={{ paddingHorizontal: spacing(4), paddingBottom: spacing(2), gap: spacing(3) }}>
          {hasOverride ? (
            <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing(3) }}>
              <Text style={{ color: colors.accent, fontSize: 12.5, fontWeight: '700' }}>Override active for this chat</Text>
              <Text style={{ color: colors.accent, fontSize: 12, marginTop: 3, opacity: 0.8 }}>
                This overrides the global system prompt only for this conversation. Clear to revert to global.
              </Text>
            </View>
          ) : (
            <View style={{ backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing(3) }}>
              <Text style={{ color: colors.textSub, fontSize: 12.5, fontWeight: '600' }}>Using global system prompt</Text>
              <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: 3 }}>Set text below to override just for this chat.</Text>
            </View>
          )}
          <TextField
            label="System prompt (this chat)"
            value={sysPromptText}
            onChangeText={setSysPromptText}
            placeholder="You are a concise assistant…"
            multiline
            style={{ minHeight: 120 }}
          />
          <Button
            label="From prompt library"
            variant="ghost"
            icon="library-outline"
            onPress={() => {
              setPromptLibTarget('override');
              setSysPromptSheet(false);
              setTimeout(() => setPromptLibSheet(true), Durations.smooth);
            }}
          />
          <View style={{ flexDirection: 'row', gap: spacing(2) }}>
            {hasOverride ? (
              <Button
                label="Clear override"
                variant="ghost"
                style={{ flex: 1 }}
                onPress={() => {
                  setConversationSystemPrompt(conversationId, undefined);
                  haptics.light();
                  setSysPromptSheet(false);
                }}
              />
            ) : (
              <Button label="Cancel" variant="ghost" style={{ flex: 1 }} onPress={() => setSysPromptSheet(false)} />
            )}
            <Button label="Save" style={{ flex: 1 }} onPress={saveSysPrompt} />
          </View>
        </View>
      </Sheet>

      <PromptLibrarySheet
        visible={promptLibSheet}
        onClose={() => {
          setPromptLibSheet(false);
          if (promptLibTarget === 'override') setTimeout(() => setSysPromptSheet(true), Durations.smooth);
        }}
        onSelect={handlePromptLibrarySelect}
        selectLabel={promptLibTarget === 'override' ? 'Use as system prompt' : 'Insert into message'}
      />

      <Sheet visible={!!actionsMsg} onClose={() => setActionsMsg(null)} title="Message">
        <View style={{ paddingHorizontal: spacing(4) }}>
          <SheetAction icon="volume-high-outline" label="Read aloud" tint={colors.chart[1]} onPress={() => { if (actionsMsg) speakAloud(actionsMsg.content, actionsMsg.id); setActionsMsg(null); }} />
          <SheetAction icon="stop-outline" label="Stop reading" onPress={() => { stopSpeaking(); setActionsMsg(null); }} />
          <SheetAction
            icon="copy-outline"
            label="Copy"
            tint={colors.chart[2]}
            onPress={async () => {
              if (actionsMsg) await Clipboard.setStringAsync(actionsMsg.content);
              haptics.success();
              setActionsMsg(null);
            }}
          />
          {actionsMsg?.role === 'user' ? (
            <SheetAction
              icon="pencil-outline"
              label="Edit & resend"
              tint={colors.chart[3]}
              onPress={() => {
                setEditText(actionsMsg?.content ?? '');
                setEditingMsg(actionsMsg);
                setActionsMsg(null);
                setTimeout(() => setEditSheet(true), Durations.smooth);
              }}
            />
          ) : null}
          {actionsMsg?.role === 'assistant' ? (
            <SheetAction
              icon="refresh"
              label="Regenerate"
              tint={colors.chart[4]}
              onPress={() => {
                setActionsMsg(null);
                deleteMessage(conversationId, actionsMsg.id);
                sendMessage(conversationId, { regenerate: true }).catch((e: Error) => setBanner(e.message));
              }}
            />
          ) : null}
          <SheetAction
            icon="trash-outline"
            label="Delete"
            danger
            onPress={() => {
              if (actionsMsg) deleteMessage(conversationId, actionsMsg.id);
              haptics.warning();
              setActionsMsg(null);
            }}
          />
        </View>
      </Sheet>

      <ConfirmSheet />

      <Sheet
        visible={editSheet}
        onClose={() => {
          setEditSheet(false);
          setEditingMsg(null);
        }}
        title="Edit message"
      >
        <View style={{ paddingHorizontal: spacing(4), paddingBottom: spacing(2) }}>
          <TextField value={editText} onChangeText={setEditText} multiline autoFocus />
          <Button label="Save & resend" icon="arrow-up" onPress={onEditSave} />
        </View>
      </Sheet>
    </View>
  );
}

/* ------------------------------ streaming hairline --------------------------- */

function StreamingBar({ color, active }: { color: string; active: boolean }) {
  const x = useSharedValue(0);
  useEffect(() => {
    if (active && !isReducedMotion()) {
      x.set(0);
      x.set(withTiming(1, { duration: 1100, easing: Ease.inOut }));
    } else {
      x.set(0);
    }
  }, [active, x]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(x.get(), [0, 1], [-160, 420]) }],
    opacity: interpolate(x.get(), [0, 0.15, 0.85, 1], [0, 1, 1, 0]),
  }));
  return <Animated.View style={[styles.progressBar, { backgroundColor: color }, style]} />;
}

/* --------------------------------- composer --------------------------------- */

interface ComposerWithPromptLibProps {
  streaming: boolean;
  sendOnEnter?: boolean;
  onSend: (text: string, attachments: MessageAttachment[]) => void;
  onStop: () => void;
  prefillRef: React.MutableRefObject<((text: string) => void) | null>;
  onOpenPromptLib: () => void;
  initialText?: string;
}

function ComposerWithPromptLib({
  streaming,
  sendOnEnter,
  onSend,
  onStop,
  prefillRef,
  onOpenPromptLib,
  initialText,
}: ComposerWithPromptLibProps) {
  const [prefill, setPrefill] = useState(initialText ?? '');
  prefillRef.current = (text: string) => setPrefill(text);
  return (
    <Composer
      streaming={streaming}
      sendOnEnter={sendOnEnter}
      onSend={onSend}
      onStop={onStop}
      onPickImage={pickImageAttachment}
      initialText={prefill}
      onOpenPromptLib={onOpenPromptLib}
    />
  );
}

/* ---------------------------------- chrome ---------------------------------- */

function TimeDivider({ ts }: { ts: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', marginVertical: spacing(2) }}>
      <View style={{ backgroundColor: colors.surface2, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 }}>
        <Text style={{ color: colors.textFaint, fontSize: 11.5, fontWeight: '600' }}>{dividerLabel(ts)}</Text>
      </View>
    </View>
  );
}

function dividerLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (d.toDateString() === yesterday.toDateString()) {
    return `Yesterday ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing(3),
    paddingBottom: spacing(2),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), minHeight: 52 },
  roundBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  thinkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, overflow: 'hidden' },
  progressBar: { position: 'absolute', top: 0, left: 0, width: 160, height: 2, borderRadius: 1 },
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2.5),
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing(3),
    marginBottom: spacing(3),
  },
  noteBox: { borderRadius: radius.md, padding: spacing(3) },
  fabWrap: { position: 'absolute', right: spacing(4), bottom: spacing(4) },
  fab: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
      default: { boxShadow: '0 4px 16px rgba(0,0,0,0.18)' } as never,
    }),
  },
});
