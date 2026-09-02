import React, { useMemo } from 'react';
import { Platform, Text, TextStyle } from 'react-native';
import { useTheme } from '@/src/theme';
import { tokenize, type TokType } from '@/src/utils/highlight';

/** System mono stack — SF Mono on iOS, Roboto Mono-ish on Android, ui-monospace on web. */
export const MONO_FONT = Platform.select<string | undefined>({
  ios: 'Menlo',
  android: 'monospace',
  default: undefined,
});

/**
 * Coloured code, rendered as nested <Text> spans so it wraps and stays
 * selectable like any other message text. Tokens come from the dependency-free
 * lexer in `src/utils/highlight.ts`; colours from the theme's `code` palette.
 */
export function HighlightedCode({
  code,
  lang,
  style,
}: {
  code: string;
  lang?: string;
  style?: TextStyle;
}) {
  const { colors } = useTheme();
  const toks = useMemo(() => tokenize(code, lang ?? ''), [code, lang]);
  const palette = colors.code;

  return (
    <Text selectable style={[{ color: palette.plain, fontFamily: MONO_FONT }, style]}>
      {toks.map((t, i) => (
        <Text key={i} style={{ color: palette[t.t as TokType] ?? palette.plain }}>
          {t.s}
        </Text>
      ))}
    </Text>
  );
}
