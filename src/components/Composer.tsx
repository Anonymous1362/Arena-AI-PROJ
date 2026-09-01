import React, { useCallback, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, radius, spacing } from '@/src/theme';
import { PressableScale } from '@/src/components/PressableScale';
import { haptics } from '@/src/utils/haptics';
import type { MessageAttachment } from '@/src/store/chats';
import { ArrowUp, Paperclip, Stop, Close } from '@/src/components/Icons';

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
  placeholder?: string;
}

export function Composer({
  streaming,
  disabled,
  sendOnEnter,
  onSend,
  onStop,
  onPickImage,
  initialText,
  placeholder = 'Message Copper…',
}: ComposerProps) {
  const { colors } = useTheme();
  const [text, setText] = useState(initialText ?? '');
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [height, setHeight] = useState(0);
  const inputRef = useRef<TextInput>(null);

  React.useEffect(() => {
    if (initialText) {
      setText(initialText);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [initialText]);

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
  }, [attachments, disabled, onSend, onStop, streaming, text]);

  const pick = useCallback(async () => {
    haptics.light();
    const picked = await onPickImage();
    if (picked?.length) setAttachments((a) => [...a, ...picked].slice(0, 4));
  }, [onPickImage]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
        <PressableScale haptic="light" onPress={pick} scale={0.88} disabled={streaming}>
          <View style={[styles.plusBtn, { backgroundColor: colors.surface2 }]}>
            <Paperclip size={19} color={streaming ? colors.textFaint : colors.accent} />
          </View>
        </PressableScale>

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

        <PressableScale haptic="none" scale={0.88} onPress={submit} disabled={!streaming && !canSend}>
          <View>
            {streaming ? (
              <View style={[styles.sendBtn, { backgroundColor: colors.surface3, borderRadius: 12 }]}>
                <Stop size={16} color={colors.danger} />
              </View>
            ) : (
              <View
                style={[
                  styles.sendBtn,
                  {
                    backgroundColor: colors.accent,
                    borderRadius: 12,
                    opacity: canSend ? 1 : 0.35,
                  },
                ]}
              >
                <ArrowUp size={20} color={colors.onAccent} strokeWidth={2.2} />
              </View>
            )}
          </View>
        </PressableScale>
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
