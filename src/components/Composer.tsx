import React, { useCallback, useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme, radius, spacing } from '@/src/theme';
import { Spring } from '@/src/theme/motion';
import { PressableScale } from '@/src/components/PressableScale';
import { haptics } from '@/src/utils/haptics';

export interface ComposerProps {
  streaming: boolean;
  disabled?: boolean;
  sendOnEnter?: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Initial text to prefill (e.g. from empty-state suggestions). */
  initialText?: string;
  placeholder?: string;
}

export function Composer({
  streaming,
  disabled,
  sendOnEnter,
  onSend,
  onStop,
  initialText,
  placeholder = 'Message Aurora…',
}: ComposerProps) {
  const { colors } = useTheme();
  const [text, setText] = useState(initialText ?? '');
  const [height, setHeight] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const iconSwap = useSharedValue(0);

  React.useEffect(() => {
    if (initialText) {
      setText(initialText);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [initialText]);

  const canSend = text.trim().length > 0 && !disabled && !streaming;

  const submit = useCallback(() => {
    if (streaming) {
      haptics.medium();
      onStop();
      return;
    }
    const t = text.trim();
    if (!t || disabled) return;
    haptics.light();
    onSend(t);
    setText('');
    setHeight(0);
  }, [disabled, onSend, onStop, streaming, text]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(iconSwap.get() ? 1 : 1, Spring.snappy) }],
  }));

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <TextInput
        ref={inputRef}
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        multiline
        onContentSizeChange={(e) =>
          setHeight(Math.min(140, Math.max(0, e.nativeEvent.contentSize.height - 22)))
        }
        onSubmitEditing={() => {
          if (Platform.OS === 'web' && sendOnEnter) submit();
        }}
        blurOnSubmit={false}
        editable={!disabled}
        style={[styles.input, { color: colors.text, height: 22 + height }]}
        selectionColor={colors.accent}
      />
      <Animated.View style={iconStyle}>
        <PressableScale
          haptic="none"
          scale={0.88}
          onPress={submit}
          disabled={!streaming && !canSend}
        >
          <View>
            {streaming ? (
              <View
                style={[
                  styles.sendBtn,
                  { backgroundColor: colors.surface3, borderRadius: 10 },
                ]}
              >
                <View style={{ width: 12, height: 12, borderRadius: 2.5, backgroundColor: colors.danger }} />
              </View>
            ) : (
              <LinearGradient
                colors={[colors.userBubbleFrom, colors.userBubbleTo]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.sendBtn, { opacity: canSend ? 1 : 0.4 }]}
              >
                <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
              </LinearGradient>
            )}
          </View>
        </PressableScale>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing(2),
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing(3.5),
    paddingTop: spacing(1.2),
    paddingBottom: spacing(1.2),
  },
  input: {
    flex: 1,
    fontSize: 15.5,
    lineHeight: 22,
    paddingTop: spacing(2),
    paddingBottom: spacing(1),
    maxHeight: 160,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
});
