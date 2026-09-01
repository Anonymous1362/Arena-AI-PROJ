import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTheme, radius, spacing } from '@/src/theme';
import { Spring } from '@/src/theme/motion';
import type { Conversation } from '@/src/store/chats';
import { PressableScale } from '@/src/components/PressableScale';
import { formatRelative, truncate } from '@/src/utils/format';
import { useSettingsStore } from '@/src/store/settings';
import { haptics } from '@/src/utils/haptics';

const ACTIONS_WIDTH = 152;

function labelFor(model: Conversation['model']): string {
  const state = useSettingsStore.getState();
  if (!model) return 'No model';
  return model.model || state.profiles.find((p) => p.id === model.profileId)?.name || 'API';
}

export function ConversationRow({
  conversation,
  streaming,
  onPress,
  onDelete,
  onPin,
}: {
  conversation: Conversation;
  streaming?: boolean;
  onPress: () => void;
  onDelete: () => void;
  onPin: () => void;
}) {
  const { colors } = useTheme();
  const tx = useSharedValue(0);
  const context = useSharedValue(0);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-14, 14])
        .failOffsetY([-10, 10])
        .onStart(() => {
          context.set(tx.get());
        })
        .onUpdate((e) => {
          const next = context.get() + e.translationX;
          tx.set(Math.max(-ACTIONS_WIDTH - 12, Math.min(0, next)));
        })
        .onEnd((e) => {
          const open = context.get() + e.translationX < -ACTIONS_WIDTH / 2;
          tx.set(withSpring(open ? -ACTIONS_WIDTH : 0, Spring.snappy));
          if (open) haptics.light();
        }),
    [context, tx]
  );

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.get() }] }));
  const openNow = () => tx.set(withSpring(-ACTIONS_WIDTH, Spring.snappy));
  const closeNow = () => tx.set(withTiming(0, { duration: 160 }));

  const last = conversation.messages[conversation.messages.length - 1];
  const preview = last
    ? `${last.role === 'user' ? 'You: ' : ''}${truncate(last.content || last.error || '…', 64)}`
    : 'No messages yet';

  return (
    <View style={{ marginBottom: spacing(2) }}>
      {/* actions behind the row (right side) */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={styles.actionsRow} pointerEvents="box-none">
          <PressableScale
            haptic="light"
            scale={0.92}
            onPress={() => {
              onPin();
              closeNow();
            }}
          >
            <View style={[styles.actionBtn, { backgroundColor: colors.surface3 }]}>
              <Ionicons name={conversation.pinned ? 'pin' : 'pin-outline'} size={20} color={colors.text} />
            </View>
          </PressableScale>
          <PressableScale
            haptic="warning"
            scale={0.92}
            onPress={() => {
              closeNow();
              onDelete();
            }}
          >
            <View style={[styles.actionBtn, { backgroundColor: colors.dangerSoft }]}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </View>
          </PressableScale>
        </View>
      </View>

      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>
          <PressableScale
            haptic="light"
            scale={0.985}
            opacityOnPress={0.85}
            onPress={() => {
              if (tx.get() !== 0) {
                closeNow();
                return;
              }
              onPress();
            }}
            onLongPress={openNow}
          >
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                {conversation.pinned ? <Ionicons name="pin" size={12} color={colors.accent} /> : null}
                <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15.5, fontWeight: '700', flex: 1 }}>
                  {conversation.title}
                </Text>
                {streaming ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success }} />
                    <Text style={{ color: colors.success, fontSize: 11, fontWeight: '700' }}>live</Text>
                  </View>
                ) : (
                  <Text style={{ color: colors.textFaint, fontSize: 12 }}>{formatRelative(conversation.updatedAt)}</Text>
                )}
              </View>
              <Text numberOfLines={1} style={{ color: colors.textSub, fontSize: 13.5 }}>{preview}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing(1.5) }}>
                <Ionicons name="cloud-outline" size={12} color={colors.textFaint} />
                <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 11.5 }}>
                  {labelFor(conversation.model)}
                </Text>
              </View>
            </View>
          </PressableScale>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing(3.6),
    paddingVertical: spacing(3),
  },
  actionsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing(2),
    paddingRight: spacing(1),
  },
  actionBtn: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
