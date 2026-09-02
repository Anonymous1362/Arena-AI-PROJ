import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, radius, spacing } from '@/src/theme';
import { Durations, Ease, Spring, enterStagger, isReducedMotion } from '@/src/theme/motion';
import { PressableScale } from '@/src/components/PressableScale';
import { ConversationRow } from '@/src/components/ConversationRow';
import { useChatsStore, selectSortedConversations, type Conversation } from '@/src/store/chats';
import { useStreamingStore } from '@/src/ai/session';
import { haptics } from '@/src/utils/haptics';
import { dismissKeyboard } from '@/src/utils/keyboard';

/**
 * Conversation library — a left-edge drawer overlay.
 *
 * The Chat tab is now an actual chat, so the history moved here: spring-driven
 * slide-in, dimmed backdrop, drag-to-dismiss, edge-swipe friendly, grouped by
 * recency with a staggered row entrance. Works identically on iOS, Android and
 * the PWA.
 */

const DAY = 86_400_000;

function bucketOf(ts: number): string {
  const now = Date.now();
  const d = new Date(ts);
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === new Date(now - DAY).toDateString()) return 'Yesterday';
  if (now - ts < 7 * DAY) return 'Previous 7 days';
  if (now - ts < 30 * DAY) return 'Previous 30 days';
  return 'Older';
}

const BUCKET_ORDER = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'];

export interface ChatLibraryProps {
  visible: boolean;
  onClose: () => void;
  activeId?: string | null;
  onOpen: (conversationId: string) => void;
  onNewChat: () => void;
}

export function ChatLibrary({ visible, onClose, activeId, onOpen, onNewChat }: ChatLibraryProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(348, Math.round(width * 0.86));
  const reduced = isReducedMotion();

  const conversations = useChatsStore((s) => s.conversations);
  const deleteConversation = useChatsStore((s) => s.deleteConversation);
  const togglePin = useChatsStore((s) => s.togglePin);
  const streamingIds = useStreamingStore((s) => s.ids);

  const [query, setQuery] = useState('');
  const tx = useSharedValue(reduced ? 0 : -panelWidth - 24);
  const backdrop = useSharedValue(0);
  const [mounted, setMounted] = useState(visible);

  const sorted = useMemo(() => selectSortedConversations(conversations), [conversations]);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? sorted.filter(
            (c) => c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q))
          )
        : sorted,
    [sorted, q]
  );

  const groups = useMemo(() => {
    const pinned = filtered.filter((c) => c.pinned);
    const rest = filtered.filter((c) => !c.pinned);
    const out: { title: string; items: Conversation[] }[] = [];
    if (pinned.length) out.push({ title: 'Pinned', items: pinned });
    for (const b of BUCKET_ORDER) {
      const items = rest.filter((c) => bucketOf(c.updatedAt) === b);
      if (items.length) out.push({ title: b, items });
    }
    return out;
  }, [filtered]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      tx.set(reduced ? 0 : withSpring(0, Spring.glide));
      backdrop.set(withTiming(1, { duration: Durations.normal, easing: Ease.out }));
    } else {
      dismissKeyboard();
      tx.set(withTiming(reduced ? 0 : -panelWidth - 24, { duration: reduced ? 1 : Durations.smooth, easing: Ease.in }));
      backdrop.set(
        withTiming(0, { duration: reduced ? 1 : Durations.normal }, (done) => {
          if (done) runOnJS(setMounted)(false);
        })
      );
    }
  }, [backdrop, panelWidth, reduced, tx, visible]);

  const close = useCallback(() => {
    haptics.navigate();
    onClose();
  }, [onClose]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .onUpdate((e) => {
          tx.set(Math.min(0, e.translationX));
        })
        .onEnd((e) => {
          const shouldClose = e.translationX < -panelWidth * 0.3 || e.velocityX < -700;
          if (shouldClose) {
            tx.set(withTiming(-panelWidth - 24, { duration: Durations.smooth, easing: Ease.in }));
            backdrop.set(withTiming(0, { duration: Durations.normal }, (done) => {
              if (done) runOnJS(setMounted)(false);
            }));
            runOnJS(close)();
          } else {
            tx.set(withSpring(0, Spring.glide));
            backdrop.set(withTiming(1, { duration: Durations.fast }));
          }
        }),
    [backdrop, close, panelWidth, tx]
  );

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.get() }));

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

  if (!mounted) return null;

  let rowIndex = 0;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View pointerEvents="auto" style={[StyleSheet.absoluteFill, { backgroundColor: colors.backdrop }, backdropStyle]}>
        <PressableScale haptic="none" scale={1} opacityOnPress={1} onPress={close} style={StyleSheet.absoluteFill}>
          <View style={StyleSheet.absoluteFill} />
        </PressableScale>
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.panel,
            {
              width: panelWidth,
              backgroundColor: colors.bgElevated,
              borderColor: colors.border,
              paddingTop: insets.top + spacing(2),
              paddingBottom: Math.max(insets.bottom, spacing(3)),
            },
            panelStyle,
          ]}
        >
          {/* header */}
          <View style={styles.headRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 }}>Chats</Text>
              <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: 2 }}>
                {conversations.length} conversation{conversations.length === 1 ? '' : 's'} · on this device
              </Text>
            </View>
            <PressableScale haptic="press" scale={0.9} onPress={close}>
              <View style={[styles.closeBtn, { backgroundColor: colors.surface2 }]}>
                <Ionicons name="close" size={19} color={colors.text} />
              </View>
            </PressableScale>
          </View>

          {/* search */}
          {conversations.length > 0 ? (
            <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search" size={15} color={colors.textFaint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search chats"
                placeholderTextColor={colors.textFaint}
                style={{ flex: 1, color: colors.text, fontSize: 14.5, paddingVertical: spacing(2) }}
                autoCorrect={false}
                returnKeyType="search"
              />
              {query ? (
                <PressableScale haptic="none" scale={0.86} onPress={() => setQuery('')}>
                  <Ionicons name="close-circle" size={16} color={colors.textFaint} />
                </PressableScale>
              ) : null}
            </View>
          ) : null}

          {/* list */}
          <Animated.ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: spacing(3), paddingBottom: spacing(4) }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {groups.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name={query ? 'search' : 'chatbubble-ellipses-outline'} size={26} color={colors.textFaint} />
                <Text style={{ color: colors.textSub, marginTop: spacing(2), fontSize: 13.5, textAlign: 'center' }}>
                  {query ? `No chats match “${query.trim()}”` : 'No conversations yet — start one below.'}
                </Text>
              </View>
            ) : (
              groups.map((g) => (
                <View key={g.title}>
                  <Text style={[styles.groupTitle, { color: colors.textFaint }]}>{g.title}</Text>
                  {g.items.map((c) => {
                    const i = rowIndex++;
                    const isActive = c.id === activeId;
                    return (
                      <Animated.View
                        key={c.id}
                        entering={reduced ? undefined : enterStagger(i, 18)}
                        style={[isActive && { backgroundColor: colors.accentSoft, borderRadius: radius.lg }]}
                      >
                        <ConversationRow
                          conversation={c}
                          streaming={!!streamingIds[c.id]}
                          onPress={() => {
                            haptics.selection();
                            onOpen(c.id);
                            onClose();
                          }}
                          onDelete={() => confirmDelete(c)}
                          onPin={() => togglePin(c.id)}
                        />
                      </Animated.View>
                    );
                  })}
                </View>
              ))
            )}
          </Animated.ScrollView>

          {/* footer */}
          <View style={{ paddingHorizontal: spacing(3), gap: spacing(2) }}>
            <PressableScale
              haptic="press"
              scale={0.97}
              onPress={() => {
                onNewChat();
                onClose();
              }}
            >
              <View style={[styles.newBtn, { backgroundColor: colors.accent }]}>
                <Ionicons name="add" size={18} color={colors.onAccent} />
                <Text style={{ color: colors.onAccent, fontSize: 14.5, fontWeight: '800' }}>New chat</Text>
              </View>
            </PressableScale>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderTopRightRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    borderRightWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 28, shadowOffset: { width: 6, height: 0 } },
      android: { elevation: 20 },
      default: { boxShadow: '8px 0 40px rgba(0,0,0,0.28)' } as never,
    }),
  },
  headRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing(4), paddingBottom: spacing(3), gap: spacing(2) },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing(3),
    marginBottom: spacing(3),
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing(3.5),
  },
  groupTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: spacing(4),
    marginBottom: spacing(1),
    paddingHorizontal: spacing(2),
  },
  empty: { alignItems: 'center', paddingVertical: spacing(12), paddingHorizontal: spacing(4) },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.md,
    paddingVertical: spacing(3.2),
  },
});
