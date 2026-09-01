import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, radius, spacing } from '@/src/theme';
import { useChatsStore, type ChatMessage } from '@/src/store/chats';
import { useSettingsStore } from '@/src/store/settings';
import {
  consumeNoModel,
  onNoModel,
  sendMessage,
  stopGeneration,
  useStreamingStore,
} from '@/src/ai/session';
import { MessageBubble } from '@/src/components/MessageBubble';
import { Composer } from '@/src/components/Composer';
import { ModelSheet } from '@/src/components/ModelSheet';
import { ModelPill } from '@/src/components/ModelPill';
import { Sheet } from '@/src/components/Sheet';
import { PressableScale } from '@/src/components/PressableScale';
import { Banner, Button, TextField } from '@/src/components/ui';
import { EmptyState } from '@/src/components/EmptyState';
import { haptics } from '@/src/utils/haptics';
import { shareJson } from '@/src/utils/share';

function SheetAction({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale haptic="light" scale={0.98} onPress={onPress}>
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
        <Ionicons name={icon} size={19} color={danger ? colors.danger : colors.text} />
        <Text style={{ color: danger ? colors.danger : colors.text, fontSize: 15, fontWeight: '600' }}>
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

export default function ChatScreen() {
  const { id, prefill } = useLocalSearchParams<{ id: string; prefill?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const conv = useChatsStore((s) => s.conversations.find((c) => c.id === id));
  const deleteMessage = useChatsStore((s) => s.deleteMessage);
  const renameConversation = useChatsStore((s) => s.renameConversation);
  const togglePin = useChatsStore((s) => s.togglePin);
  const setConversationModel = useChatsStore((s) => s.setConversationModel);
  const sendOnEnter = useSettingsStore((s) => s.behavior.sendOnEnter);
  const msgFontSize = useTheme().msgFontSize;
  const streaming = useStreamingStore((s) => !!s.ids[id!]);

  const [modelSheet, setModelSheet] = useState(false);
  const [menuSheet, setMenuSheet] = useState(false);
  const [renameSheet, setRenameSheet] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [editSheet, setEditSheet] = useState(false);
  const [editText, setEditText] = useState('');
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [actionsMsg, setActionsMsg] = useState<ChatMessage | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const listRef = useRef<ScrollView>(null);

  const messages = conv?.messages ?? [];
  const lastMessage = messages[messages.length - 1];

  // nudge the user into the model picker when sending without a model
  useEffect(() => {
    return onNoModel((convId) => {
      if (convId !== id) return;
      consumeNoModel(convId);
      setBanner('Pick a model first — on-device or any API.');
      setModelSheet(true);
    });
  }, [id]);

  useEffect(() => {
    if (!conv) router.replace('/(tabs)');
  }, [conv, router]);

  const send = useCallback(
    (text: string) => {
      setBanner(null);
      sendMessage(id!, { text }).catch((e: Error) => setBanner(e.message));
    },
    [id]
  );

  const retry = useCallback(() => {
    if (!conv) return;
    const last = conv.messages[conv.messages.length - 1];
    if (last?.role === 'assistant') deleteMessage(conv.id, last.id);
    sendMessage(id!, { regenerate: true }).catch((e: Error) => setBanner(e.message));
  }, [conv, deleteMessage, id]);

  const onEditSave = useCallback(() => {
    if (!editingMsg) return;
    const text = editText.trim();
    setEditSheet(false);
    if (text) {
      sendMessage(id!, { editMessageId: editingMsg.id, text }).catch((e: Error) =>
        setBanner(e.message)
      );
    }
    setEditingMsg(null);
  }, [editText, editingMsg, id]);

  const exportChat = useCallback(async () => {
    if (!conv) return;
    try {
      await shareJson(
        `aurora-chat-${conv.title.replace(/[^\w-]+/g, '_').slice(0, 32) || 'chat'}.json`,
        { app: 'aurora', kind: 'conversation', exportedAt: new Date().toISOString(), conversation: conv }
      );
    } catch (e) {
      setBanner(`Export failed: ${(e as Error).message}`);
    }
  }, [conv]);

  const menuActions = useMemo(
    () => (
      <>
        <SheetAction icon="pencil-outline" label="Rename" onPress={() => { setRenameText(conv?.title ?? ''); setMenuSheet(false); setTimeout(() => setRenameSheet(true), 240); }} />
        <SheetAction icon={conv?.pinned ? 'pin' : 'pin-outline'} label={conv?.pinned ? 'Unpin' : 'Pin to top'} onPress={() => { togglePin(id!); setMenuSheet(false); }} />
        <SheetAction icon="share-outline" label="Export chat (.json)" onPress={() => { setMenuSheet(false); exportChat(); }} />
        <SheetAction icon="cube-outline" label="Change model" onPress={() => { setMenuSheet(false); setModelSheet(true); }} />
        <SheetAction
          icon="refresh-outline"
          label="Clear messages"
          onPress={() => {
            setMenuSheet(false);
            if (!conv) return;
            for (const m of [...conv.messages]) deleteMessage(conv.id, m.id);
            haptics.warning();
          }}
        />
      </>
    ),
    [conv, exportChat, id, togglePin, deleteMessage]
  );

  if (!conv) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const engineReady = !!conv.model || !!useSettingsStore.getState().activeModel;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* header */}
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <PressableScale haptic="light" onPress={() => router.back()} scale={0.9}>
            <View style={[styles.backBtn, { backgroundColor: colors.surface2 }]}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </View>
          </PressableScale>
          <View style={{ flex: 1, marginHorizontal: spacing(2) }}>
            <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: -0.2 }}>
              {conv.title}
            </Text>
            <View style={{ alignSelf: 'flex-start', marginTop: 2 }}>
              <ModelPill model={conv.model} onPress={() => setModelSheet(true)} />
            </View>
          </View>
          <PressableScale haptic="light" onPress={() => setMenuSheet(true)} scale={0.9}>
            <View style={[styles.backBtn, { backgroundColor: colors.surface2 }]}>
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
            </View>
          </PressableScale>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {banner ? (
          <View style={{ paddingHorizontal: spacing(4), paddingTop: spacing(2) }}>
            <Banner kind="warn" text={banner} onClose={() => setBanner(null)} actionLabel="Pick model" onAction={() => setModelSheet(true)} />
          </View>
        ) : null}

        {messages.length === 0 ? (
          <EmptyState engineReady={engineReady} onPick={send} />
        ) : (
          <ScrollView
            ref={listRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: spacing(4), paddingTop: spacing(3), paddingBottom: spacing(4), flexGrow: 1, justifyContent: 'flex-end' }}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: streaming })}
            showsVerticalScrollIndicator={false}
          >
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                fontSize={msgFontSize}
                streaming={streaming && m === lastMessage && m.role === 'assistant'}
                onLongPress={setActionsMsg}
                onRetry={retry}
              />
            ))}
          </ScrollView>
        )}

        <View style={{ paddingHorizontal: spacing(3), paddingBottom: Math.max(spacing(3), insets.bottom + 8), paddingTop: spacing(2) }}>
          <Composer
            streaming={streaming}
            sendOnEnter={sendOnEnter}
            onSend={send}
            onStop={() => stopGeneration(id!)}
            initialText={prefill}
          />
        </View>
      </KeyboardAvoidingView>

      {/* model picker */}
      <ModelSheet
        visible={modelSheet}
        onClose={() => setModelSheet(false)}
        current={conv.model}
        onPicked={(m) => setConversationModel(id!, m)}
      />

      {/* conversation menu */}
      <Sheet visible={menuSheet} onClose={() => setMenuSheet(false)} title="Chat options">
        <View style={{ paddingHorizontal: spacing(4) }}>{menuActions}</View>
      </Sheet>

      {/* rename */}
      <Sheet visible={renameSheet} onClose={() => setRenameSheet(false)} title="Rename chat">
        <View style={{ paddingHorizontal: spacing(4), paddingBottom: spacing(2) }}>
          <TextField
            value={renameText}
            onChangeText={setRenameText}
            placeholder="Chat name"
            autoFocus
            onSubmitEditing={() => {
              if (renameText.trim()) renameConversation(id!, renameText.trim());
              setRenameSheet(false);
            }}
          />
          <Button label="Save" onPress={() => { if (renameText.trim()) renameConversation(id!, renameText.trim()); setRenameSheet(false); }} />
        </View>
      </Sheet>

      {/* message actions */}
      <Sheet visible={!!actionsMsg} onClose={() => setActionsMsg(null)} title="Message">
        <View style={{ paddingHorizontal: spacing(4) }}>
          <SheetAction
            icon="copy-outline"
            label="Copy"
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
              onPress={() => {
                setEditText(actionsMsg?.content ?? '');
                setEditingMsg(actionsMsg);
                setActionsMsg(null);
                setTimeout(() => setEditSheet(true), 240);
              }}
            />
          ) : null}
          {actionsMsg?.role === 'assistant' ? (
            <SheetAction
              icon="refresh"
              label="Regenerate"
              onPress={() => {
                setActionsMsg(null);
                deleteMessage(id!, actionsMsg.id);
                sendMessage(id!, { regenerate: true }).catch((e: Error) => setBanner(e.message));
              }}
            />
          ) : null}
          <SheetAction
            icon="trash-outline"
            label="Delete"
            danger
            onPress={() => {
              if (actionsMsg) deleteMessage(id!, actionsMsg.id);
              haptics.warning();
              setActionsMsg(null);
            }}
          />
        </View>
      </Sheet>

      {/* edit user message */}
      <Sheet visible={editSheet} onClose={() => { setEditSheet(false); setEditingMsg(null); }} title="Edit message">
        <View style={{ paddingHorizontal: spacing(4), paddingBottom: spacing(2) }}>
          <TextField value={editText} onChangeText={setEditText} multiline autoFocus />
          <Button label="Save & resend" icon="arrow-up" onPress={onEditSave} />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing(3),
    paddingBottom: spacing(2),
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', height: 46 },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
