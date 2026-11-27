/**
 * Reasoning-aware streaming assembler.
 *
 * It separates provider reasoning from visible answer text while batching UI
 * updates. OpenAI-compatible gateways unfortunately disagree on how they send
 * thinking: some use a dedicated field, while others put <think>, <thought>,
 * or HTML-escaped versions inside normal content. Copper accepts all of those
 * forms so internal traces never leak into the answer bubble.
 */

const OPEN_TAGS = ['<think>', '<thought>', '&lt;think&gt;', '&lt;thought&gt;'];
const CLOSE_TAGS = ['</think>', '</thought>', '&lt;/think&gt;', '&lt;/thought&gt;'];

export interface AssemblerOptions {
  throttleMs?: number;
  onUpdate?: (content: string, reasoning: string) => void;
}

export class StreamAssembler {
  private content = '';
  private reasoning = '';
  private inThinking = false;
  private buf = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly throttleMs: number;
  private readonly onUpdate?: (content: string, reasoning: string) => void;

  constructor(opts: AssemblerOptions = {}) {
    this.throttleMs = opts.throttleMs ?? 80;
    this.onUpdate = opts.onUpdate;
  }

  /** Feed a normal content delta; inline thinking wrappers are stripped. */
  feed(delta: string): void {
    this.buf += delta;
    this.process();
    this.schedule();
  }

  /** Feed a provider's dedicated reasoning delta without exposing it as text. */
  feedReasoning(delta: string): void {
    if (!delta) return;
    this.reasoning += delta;
    this.schedule();
  }

  /** Force-emit current state (call when the stream completes). */
  flush(): { content: string; reasoning: string } {
    this.process(true);
    this.cancelTimer();
    this.emit();
    return { content: this.content, reasoning: this.reasoning };
  }

  get current(): { content: string; reasoning: string } {
    return { content: this.content, reasoning: this.reasoning };
  }

  /** Consume complete thinking tags; hold a possible partial tag between chunks. */
  private process(final = false): void {
    for (;;) {
      const tags = this.inThinking ? CLOSE_TAGS : OPEN_TAGS;
      const match = firstTag(this.buf, tags);
      if (!match) break;

      const before = this.buf.slice(0, match.index);
      if (this.inThinking) this.reasoning += before;
      else this.content += before;
      this.buf = this.buf.slice(match.index + match.tag.length);
      this.inThinking = !this.inThinking;
    }

    if (final) {
      if (this.inThinking) this.reasoning += this.buf;
      else this.content += this.buf;
      this.buf = '';
      return;
    }

    const hold = partialTagLength(this.buf, this.inThinking ? CLOSE_TAGS : OPEN_TAGS);
    if (this.buf.length > hold) {
      const emitLen = this.buf.length - hold;
      const part = this.buf.slice(0, emitLen);
      this.buf = this.buf.slice(emitLen);
      if (this.inThinking) this.reasoning += part;
      else this.content += part;
    }
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.emit();
    }, this.throttleMs);
  }

  private cancelTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emit(): void {
    this.onUpdate?.(this.content, this.reasoning);
  }
}

function firstTag(text: string, tags: string[]): { index: number; tag: string } | null {
  let result: { index: number; tag: string } | null = null;
  for (const tag of tags) {
    const index = text.toLowerCase().indexOf(tag);
    if (index !== -1 && (!result || index < result.index)) result = { index, tag };
  }
  return result;
}

function partialTagLength(tail: string, tags: string[]): number {
  const lowerTail = tail.toLowerCase();
  let longest = 0;
  for (const tag of tags) {
    const lowerTag = tag.toLowerCase();
    const max = Math.min(lowerTag.length - 1, lowerTail.length);
    for (let len = max; len > longest; len--) {
      if (lowerTail.endsWith(lowerTag.slice(0, len))) {
        longest = len;
        break;
      }
    }
  }
  return longest;
}
