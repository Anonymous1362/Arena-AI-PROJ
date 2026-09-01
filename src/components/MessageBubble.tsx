import React, { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, radius, spacing } from '@/src/theme';
import { Spring } from '@/src/theme/motion';
import type { ChatMessage } from '@/src/store/chats';
import { Markdown } from '@/src/components/Markdown';
import { TypingDots } from '@/src/components/TypingDots';
import { PressableScale } from '@/src/components/PressableScale';
import { formatDuration } from '@/src/utils/format';

function Caret({ color }: { color: string }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.set(withRepeat(withTiming(0.15, { duration: 420, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.Text style={[styles.caret, { color }, style]}>▍</Animated.Text>;
}

function ReasoningBlock({ text, live, spentMs }: { text: string; live: boolean; spentMs?: number }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View
      style={{
        backgroundColor: colors.reasoningBg,
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        marginBottom: spacing(2),
        overflow: 'hidden',
      }}
    >
      <PressableScale haptic="light" scale={0.99} opacityOnPress={0.8} onPress={() => setOpen((o) => !o)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: spacing(3), paddingVertical: spacing(2.2) }}>
          <Ionicons name="sparkles" size={14} color={colors.accent} />
          <Text style={{ color: colors.textSub, fontSize: 13, fontWeight: '600', flex: 1 }} numberOfLines={1}>
            {live ? 'Thinking…' : `Thought for ${formatDuration(spentMs ?? 0)}`}
          </Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textFaint} />
        </View>
      </PressableScale>
      {open ? (
        <Text
          selectable
          style={{
            color: colors.textSub,
            fontSize: 13,
            lineHeight: 19,
            paddingHorizontal: spacing(3),
            paddingBottom: spacing(2.5),
            maxHeight: 240,
          }}
        >
          {text}
        </Text>
      ) : null}
    </View>
  );
}

export interface MessageBubbleProps {
  message: ChatMessage;
  /** true while this message is being generated */
  streaming?: boolean;
  /** Optional status label shown while waiting for the first token (e.g. "Loading Qwen…"). */
  pendingLabel?: string;
  onLongPress?: (message: ChatMessage) => void;
  onRetry?: (message: ChatMessage) => void;
  /** base font size from theme */
  fontSize: number;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  streaming,
  pendingLabel,
  onLongPress,
  onRetry,
  fontSize,
}: MessageBubbleProps) {
  const { colors } = useTheme();
  const isUser = message.role === 'user';
  const showTyping = streaming && !message.content && !message.reasoning;

  const bubbleStyle = useMemo(
    () => ({
      maxWidth: '88%' as const,
      alignSelf: isUser ? ('flex-end' as const) : ('flex-start' as const),
    }),
    [isUser]
  );

  if (isUser) {
    return (
      <View style={[bubbleStyle, { alignItems: 'flex-end', marginVertical: spacing(1.2) }]}>
        <PressableScale haptic="medium" scale={0.98} onLongPress={() => onLongPress?.(message)} delayLongPress={280}>
          <LinearGradient
            colors={[colors.userBubbleFrom, colors.userBubbleTo]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.userBubble,
              { borderBottomRightRadius: message.done || !streaming ? 6 : radius.lg },
            ]}
          >
            <Text selectable style={{ color: '#FFFFFF', fontSize, lineHeight: fontSize * 1.45 }}>
              {message.content}
            </Text>
          </LinearGradient>
        </PressableScale>
      </View>
    );
  }

  return (
    <View style={[bubbleStyle, { alignItems: 'flex-start', marginVertical: spacing(1.2) }]}>
      <PressableScale haptic="medium" scale={0.99} opacityOnPress={0.85} onLongPress={() => onLongPress?.(message)} delayLongPress={280}>
        <View
          style={[
            styles.assistantBubble,
            {
              backgroundColor: colors.surface,
              borderColor: message.error ? colors.dangerSoft : colors.border,
              borderBottomLeftRadius: streaming ? radius.lg : 6,
            },
          ]}
        >
          {message.reasoning ? (
            <ReasoningBlock text={message.reasoning} live={!!streaming} spentMs={message.stats?.ms} />
          ) : null}

          {showTyping ? (
            <TypingDots label={pendingLabel} />
          ) : (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <View style={{ maxWidth: '100%' }}>
                  <Markdown>{message.content || (streaming ? '' : '…')}</Markdown>
                </View>
                {streaming ? <Caret color={colors.accent} /> : null}
              </View>

              {message.error ? (
                <View style={{ marginTop: spacing(1), gap: spacing(1.5) }}>
                  <Text style={{ color: colors.danger, fontSize: 13 }}>{message.error}</Text>
                  {onRetry ? (
                    <PressableScale haptic="light" onPress={() => onRetry(message)} scale={0.96}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          alignSelf: 'flex-start',
                          backgroundColor: colors.surface2,
                          borderRadius: radius.full,
                          paddingHorizontal: spacing(3),
                          paddingVertical: spacing(1.5),
                        }}
                      >
                        <Ionicons name="refresh" size={14} color={colors.text} />
                        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>Retry</Text>
                      </View>
                    </PressableScale>
                  ) : null}
                </View>
              ) : null}

              {!streaming && !message.error && message.stats ? (
                <Text style={[styles.stats, { color: colors.textFaint }]}>
                  {message.stats.ms ? formatDuration(message.stats.ms) : ''}
                  {message.stats.tps ? ` · ${message.stats.tps.toFixed(1)} tok/s` : ''}
                  {message.stats.tokensOut ? ` · ${Math.round(message.stats.tokensOut)} tok` : ''}
                </Text>
              ) : null}
            </>
          )}
        </View>
      </PressableScale>
    </View>
  );
});

const styles = StyleSheet.create({
  userBubble: {
    borderRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2.6),
    maxWidth: '100%',
  },
  assistantBubble: {
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing(3.6),
    paddingVertical: spacing(2.8),
    maxWidth: '100%',
  },
  caret: { fontSize: 15, fontWeight: '400', marginTop: 2 },
  stats: { fontSize: 11.5, marginTop: spacing(1.5), fontVariant: ['tabular-nums'] as never },
});
