import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MarkdownDisplay from '@ronradtke/react-native-markdown-display';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/theme';
import { radius, spacing } from '@/src/theme';
import { PressableScale } from '@/src/components/PressableScale';
import { haptics } from '@/src/utils/haptics';

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(code);
    haptics.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <View
      style={{
        backgroundColor: colors.bgElevated,
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        marginTop: spacing(1.5),
        marginBottom: spacing(2),
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing(3),
          paddingVertical: spacing(1.4),
          backgroundColor: colors.surface2,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        }}
      >
        <Text style={{ color: colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>
          {lang || 'code'}
        </Text>
        <PressableScale haptic="none" onPress={copy} scale={0.9}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color={copied ? colors.success : colors.textSub} />
            <Text style={{ color: copied ? colors.success : colors.textSub, fontSize: 12, fontWeight: '600' }}>
              {copied ? 'Copied' : 'Copy'}
            </Text>
          </View>
        </PressableScale>
      </View>
      <Text
        selectable
        style={{
          color: colors.text,
          fontFamily: Platform_fontMono,
          fontSize: 13,
          lineHeight: 20,
          padding: spacing(3),
        }}
      >
        {code.replace(/\n$/, '')}
      </Text>
    </View>
  );
}

// System mono stack across platforms (SF Mono on iOS, Roboto Mono-ish on Android,
// ui-monospace on web) — no font loading required.
const Platform_fontMono: string | undefined = undefined;

export function Markdown({ children: text }: { children: string }) {
  const { colors, scheme } = useTheme();

  const rules = useMemo(
    () => ({
      fence: (node: any) => (
        <CodeBlock key={node.key} code={String(node.content ?? '')} lang={node.sourceInfo} />
      ),
    }),
    []
  );

  const styles = useMemo(
    () => ({
      body: { color: colors.text, fontSize: 15 },
      strong: { color: colors.text, fontWeight: '700' as const },
      em: { fontStyle: 'italic' as const },
      s: { textDecorationLine: 'line-through' as const },
      link: { color: colors.accent, textDecorationLine: 'underline' as const },
      paragraph: { marginTop: 0, marginBottom: spacing(2) },
      heading1: { fontSize: 21, fontWeight: '800' as const, color: colors.text, marginTop: spacing(2), marginBottom: spacing(1.5) },
      heading2: { fontSize: 18.5, fontWeight: '800' as const, color: colors.text, marginTop: spacing(2), marginBottom: spacing(1.5) },
      heading3: { fontSize: 16.5, fontWeight: '700' as const, color: colors.text, marginTop: spacing(1.5), marginBottom: spacing(1) },
      heading4: { fontSize: 15.5, fontWeight: '700' as const, color: colors.text },
      bullet_list: { marginTop: spacing(1), marginBottom: spacing(2) },
      ordered_list: { marginTop: spacing(1), marginBottom: spacing(2) },
      list_item: { marginBottom: spacing(1) },
      bullet_list_icon: { color: colors.accent, marginLeft: -2 },
      code_inline: {
        color: colors.accent,
        backgroundColor: colors.accentSoft,
        fontFamily: Platform_fontMono,
        fontSize: 13.5,
        borderRadius: 5,
        paddingHorizontal: 5,
        paddingVertical: 1,
      },
      blockquote: {
        backgroundColor: colors.reasoningBg,
        borderLeftWidth: 3,
        borderLeftColor: colors.accent,
        borderRadius: 8,
        paddingHorizontal: spacing(3),
        paddingVertical: spacing(1),
        marginVertical: spacing(1.5),
      },
      hr: { backgroundColor: colors.border, height: 1, marginVertical: spacing(3) },
      table: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.sm },
      th: { color: colors.text, fontWeight: '700' as const, padding: 6, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
      td: { color: colors.textSub, padding: 6, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    }),
    [colors, scheme]
  );

  return <MarkdownDisplay style={styles as any} rules={rules as any}>{text}</MarkdownDisplay>;
}
