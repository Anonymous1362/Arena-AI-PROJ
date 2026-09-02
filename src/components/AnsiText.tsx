import React, { memo, useMemo } from 'react';
import { Text, TextStyle } from 'react-native';
import { parseAnsi } from '@/src/terminal/ansi';

/**
 * Renders terminal output that may contain ANSI colour codes as nested,
 * selectable <Text> spans. Plain text takes the fast path (one Text node, no
 * parsing), so the scrollback stays cheap even at thousands of lines.
 */
export const AnsiText = memo(function AnsiText({
  text,
  style,
}: {
  text: string;
  style?: TextStyle;
}) {
  const runs = useMemo(() => (text.includes('\x1b') ? parseAnsi(text) : null), [text]);

  if (!runs) {
    return (
      <Text selectable style={style}>
        {text}
      </Text>
    );
  }
  if (!runs.length) return <Text selectable style={style} />;

  return (
    <Text selectable style={style}>
      {runs.map((r, i) => (
        <Text
          key={i}
          style={{
            color: r.fg,
            backgroundColor: r.bg,
            fontWeight: r.bold ? '700' : undefined,
            fontStyle: r.italic ? 'italic' : undefined,
            textDecorationLine: r.underline ? 'underline' : 'none',
            opacity: r.faint ? 0.72 : 1,
          }}
        >
          {r.text}
        </Text>
      ))}
    </Text>
  );
});
