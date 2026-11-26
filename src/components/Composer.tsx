import React, { useCallback, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme, radius, spacing } from '@/src/theme';
import { PressableScale } from '@/src/components/PressableScale';
import { haptics } from '@/src/utils/haptics';
import type { MessageAttachment } from '@/src/store/chats';
import { ArrowUp, Paperclip, Stop, Close, Mic } from '@/src/components/Icons';
import { startDictation, sttSupported, type SttHandle } from '@/src/utils/stt';

export interface ComposerProps {
  streaming: boolean;
  disabled?: boolean;
  sendOnEnter?: boolean;
  onSend: (text: string, attachments: MessageAttachment[]) => void;
  onStop: () => void;
  /** Opens the image picker; resolves with picked attachments. */
  onPickImage: () => Promise<MessageAttachment[] | null>;
  /** Initial text to prefill (e.g. from empty-state suggestions). */
  initialText?: string;
  /** Conversation id — unsent text is kept per chat. */
  draftKey?: string;
  placeholder?: string;
  /** Opens the prompt-library sheet so a saved prompt can be inserted. */
  onOpenPromptLib?: () => void;
}

function MicPulse({ color }: { color: string }) {
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  opacity.set(withRepeat(withTiming(0.35, { duration: 620, easing: Easing.inOut(Easing.quad) }), -1, true));
  const style = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View style={style}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <Mic size={19} color="#FFFFFF" />
      </View>
    </Animated.View>
  );
}

export function Composer({
  streaming,
  disabled,
  sendOnEnter,
  onSend,
  onStop,
  onPickImage,
  initialText,
  draftKey,
  placeholder = 'Message Copper…',
  onOpenPromptLib,
}: ComposerProps) {
  const { colors } = useTheme();
  const [text, setText] = useState(initialText ?? '');
  const [focused, setFocused] = useState(false);
  const draftStorageKey = draftKey ? `copper/draft/${draftKey}` : null;
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [height, setHeight] = useState(0);
  const [listening, setListening] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const sttRef = useRef<SttHandle | null>(null);
  const micAvailable = sttSupported();

  React.useEffect(() => {
    if (initialText) {
      setText(initialText);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [initialText]);

  React.useEffect(() => {
    return () => {
      sttRef.current?.stop();
    };
  }, []);

  // Restore an unsent draft when the chat reopens.
  React.useEffect(() => {
    if (!draftStorageKey) return;
    let live = true;
    AsyncStorage.getItem(draftStorageKey)
      .then((saved) => {
        if (live && saved) setText((current) => current || saved);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [draftStorageKey]);

  // Keep the draft in step with typing (debounced so we do not write per key).
  React.useEffect(() => {
    if (!draftStorageKey) return;
    const timer = setTimeout(() => {
      if (text.trim()) void AsyncStorage.setItem(draftStorageKey, text).catch(() => undefined);
      else void AsyncStorage.removeItem(draftStorageKey).catch(() => undefined);
    }, 400);
    return () => clearTimeout(timer);
  }, [draftStorageKey, text]);

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !disabled && !streaming;

  const submit = useCallback(() => {
    if (streaming) {
      haptics.medium();
      onStop();
      return;
    }
    const t = text.trim();
    if ((!t && attachments.length === 0) || disabled) return;
    haptics.light();
    onSend(t, attachments);
    setText('');
    setAttachments([]);
    setHeight(0);
    if (draftStorageKey) void AsyncStorage.removeItem(draftStorageKey).catch(() => undefined);
  }, [attachments, disabled, draftStorageKey, onSend, onStop, streaming, text]);

  const pick = useCallback(async () => {
    haptics.light();
    const picked = await onPickImage();
    if (picked?.length) setAttachments((a) => [...a, ...picked].slice(0, 4));
  }, [onPickImage]);

  const toggleMic = useCallback(() => {
    if (listening) {
      sttRef.current?.stop();
      setListening(false);
      return;
    }
    haptics.medium();
    setListening(true);
    startDictation({
      onPartial: (t) => setText(t),
      onFinal: (t) => {
        if (t) setText(t);
        setListening(false);
        sttRef.current = null;
      },
      onError: () => setListening(false),
    })
      .then((h) => {
        sttRef.current = h;
        if (!h) setListening(false);
      })
      .catch(() => setListening(false));
  }, [listening]);

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.surface,
          borderColor: focused ? colors.borderStrong : colors.border,
        },
      ]}
    >
      {attachments.length ? (
        <View style={styles.attachTray}>
          {attachments.map((a, i) => (
            <View key={`${a.uri}-${i}`} style={styles.thumbWrap}>
              <Image source={{ uri: a.uri }} style={styles.thumb} />
              <PressableScale haptic="warning" scale={0.85} onPress={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}>
                <View style={[styles.thumbX, { backgroundColor: colors.termBg }]}>
                  <Close size={11} color="#FFFFFF" strokeWidth={2.6} />
                </View>
              </PressableScale>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.inputRow}>
        <PressableScale
          haptic="light"
          onPress={pick}
          scale={0.88}
          disabled={streaming}
          accessibilityRole="button"
          accessibilityLabel="Attach images"
        >
          <View style={[styles.plusBtn, { backgroundColor: colors.surface2 }]}>
            <Paperclip size={19} color={streaming ? colors.textFaint : colors.accent} />
          </View>
        </PressableScale>

        {onOpenPromptLib ? (
          <PressableScale
            haptic="light"
            onPress={onOpenPromptLib}
            scale={0.88}
            disabled={streaming}
            accessibilityRole="button"
            accessibilityLabel="Prompt library"
          >
            <View style={[styles.plusBtn, { backgroundColor: colors.surface2 }]}>
              <Ionicons name="library-outline" size={18} color={streaming ? colors.textFaint : colors.textSub} />
            </View>
          </PressableScale>
        ) : null}

        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder={listening ? 'Listening…' : placeholder}
          placeholderTextColor={listening ? colors.accent : colors.textFaint}
          multiline
          onContentSizeChange={(e) =>
            setHeight(Math.min(140, Math.max(0, e.nativeEvent.contentSize.height - 22)))
          }
          onSubmitEditing={() => {
            if (Platform.OS === 'web' && sendOnEnter) submit();
          }}
          onKeyPress={(e) => {
            if (Platform.OS !== 'web') return;
            const ne = e.nativeEvent as unknown as {
              key?: string;
              shiftKey?: boolean;
              metaKey?: boolean;
              ctrlKey?: boolean;
            };
            if (ne.key !== 'Enter') return;
            // ⌘/Ctrl+Enter always sends; plain Enter sends only when the user
            // enabled it; Shift+Enter is always a newline.
            if (ne.metaKey || ne.ctrlKey) {
              (e as unknown as { preventDefault?: () => void }).preventDefault?.();
              submit();
            } else if (sendOnEnter && !ne.shiftKey) {
              (e as unknown as { preventDefault?: () => void }).preventDefault?.();
              submit();
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          blurOnSubmit={false}
          editable={!disabled}
          accessibilityLabel="Message Copper"
          style={[styles.input, { color: colors.text, height: 22 + height }]}
          selectionColor={colors.accent}
        />

        {streaming ? (
          <PressableScale
            haptic="none"
            scale={0.88}
            onPress={submit}
            accessibilityRole="button"
            accessibilityLabel="Stop generating"
          >
            <View style={[styles.sendBtn, { backgroundColor: colors.surface3, borderRadius: 12 }]}>
              <Stop size={16} color={colors.danger} />
            </View>
          </PressableScale>
        ) : canSend ? (
          <PressableScale
            haptic="none"
            scale={0.88}
            onPress={submit}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <View
              style={[
                styles.sendBtn,
                {
                  backgroundColor: colors.accent,
                  borderRadius: 12,
                },
              ]}
            >
              <ArrowUp size={20} color={colors.onAccent} strokeWidth={2.2} />
            </View>
          </PressableScale>
        ) : micAvailable ? (
          <PressableScale haptic="none" scale={0.88} onPress={toggleMic}>
            {listening ? (
              <MicPulse color={colors.accent} />
            ) : (
              <View style={[styles.sendBtn, { backgroundColor: colors.surface2, borderRadius: 12 }]}>
                <Mic size={19} color={colors.text} />
              </View>
            )}
          </PressableScale>
        ) : (
          <PressableScale haptic="none" scale={0.88} onPress={submit} disabled>
            <View style={[styles.sendBtn, { backgroundColor: colors.surface2, borderRadius: 12, opacity: 0.4 }]}>
              <ArrowUp size={20} color={colors.textSub} strokeWidth={2.2} />
            </View>
          </PressableScale>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing(3),
    paddingTop: spacing(1.5),
    paddingBottom: spacing(1.5),
  },
  attachTray: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: spacing(1),
    paddingTop: spacing(1),
    paddingBottom: spacing(2),
    flexWrap: 'wrap',
  },
  thumbWrap: { position: 'relative' },
  thumb: { width: 56, height: 56, borderRadius: radius.sm },
  thumbX: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing(1.6) },
  plusBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
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
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
});
