/**
 * Export a conversation as a Markdown run-log.
 *
 * Format:
 *   # <title>
 *   _Exported <date> · Model: <model>_
 *
 *   ---
 *
 *   ## Turn N — <role>  (<timestamp>)
 *
 *   <message content>
 *
 *   ### Plan  (if present)
 *   - [x] / [ ] step label
 *
 *   ### Tool events  (if present)
 *   #### $ command / tool_name  ✓/✗
 *   ```
 *   output
 *   ```
 *
 *   _Tokens in: X  |  out: Y  |  TPS: Z  |  Time: Xs_
 */
import { Platform } from 'react-native';
import { writeAgentExport } from '@/src/agent/fs';
import { shareExportedFile } from '@/src/utils/share';
import type { Conversation } from '@/src/store/chats';

function modelLabel(conv: Conversation): string {
  if (!conv.model) return 'Unknown';
  if (conv.model.kind === 'remote') return conv.model.model;
  return 'Unknown';
}

function fmtDate(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export function conversationToMarkdown(conv: Conversation): string {
  const lines: string[] = [];

  lines.push(`# ${conv.title}`);
  lines.push(`_Exported ${fmtDate(Date.now())} · Model: ${modelLabel(conv)}_`);
  lines.push('');
  lines.push('---');
  lines.push('');

  conv.messages.forEach((msg, i) => {
    const roleLabel = msg.role === 'user' ? '👤 User' : msg.role === 'assistant' ? '🤖 Assistant' : '⚙️ System';
    lines.push(`## Turn ${i + 1} — ${roleLabel}  <sub>${fmtDate(msg.createdAt)}</sub>`);
    lines.push('');

    // Main content
    if (msg.content) {
      lines.push(msg.content);
      lines.push('');
    }

    // Reasoning (thinking block)
    if (msg.reasoning) {
      lines.push('<details>');
      lines.push('<summary>Reasoning</summary>');
      lines.push('');
      lines.push(msg.reasoning);
      lines.push('</details>');
      lines.push('');
    }

    // Plan steps
    if (msg.planSteps?.length) {
      lines.push('### Plan');
      for (const step of msg.planSteps) {
        const check = step.state === 'done' ? 'x' : ' ';
        lines.push(`- [${check}] ${step.label}`);
      }
      lines.push('');
    }

    // Tool events
    if (msg.toolEvents?.length) {
      lines.push('### Tool events');
      for (const ev of msg.toolEvents) {
        const badge = ev.ok ? '✓' : '✗';
        const prefix = ev.kind === 'command' ? '$ ' : '';
        lines.push(`#### ${prefix}${ev.title}  ${badge}`);
        if (ev.output) {
          lines.push('```');
          lines.push(ev.output.slice(0, 4000));
          lines.push('```');
        }
        lines.push('');
      }
    }

    // Stats
    if (msg.stats) {
      const parts: string[] = [];
      if (msg.stats.tokensIn !== undefined) parts.push(`Tokens in: ${msg.stats.tokensIn}`);
      if (msg.stats.tokensOut !== undefined) parts.push(`out: ${msg.stats.tokensOut}`);
      if (msg.stats.tps !== undefined) parts.push(`TPS: ${msg.stats.tps.toFixed(1)}`);
      parts.push(`Time: ${fmtMs(msg.stats.ms)}`);
      lines.push(`_${parts.join('  |  ')}_`);
      lines.push('');
    }

    // Error
    if (msg.error) {
      lines.push(`> ⚠️ **Error:** ${msg.error}`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  });

  return lines.join('\n');
}

/** Write + share the markdown log. Works on native and web. */
export async function exportConversationMarkdown(conv: Conversation): Promise<void> {
  const md = conversationToMarkdown(conv);
  const filename = `copper-log-${conv.title.replace(/[^\w-]+/g, '_').slice(0, 32) || 'chat'}.md`;

  if (Platform.OS === 'web') {
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return;
  }

  const fileUri = await writeAgentExport(filename, md);
  await shareExportedFile(fileUri, {
    mimeType: 'text/markdown',
    dialogTitle: 'Export run log',
    UTI: 'public.text',
  });
}
