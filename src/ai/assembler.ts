/**
 * Reasoning-aware streaming assembler.
 *
 * ingests raw text deltas (SSE tokens or llama.cpp tokens) and separates
 * <think>…</think> reasoning traces from the visible answer, while batching
 * UI updates to a steady throttle so streaming never janks the UI thread.
 */

const OPEN = '<think>';
const CLOSE = '</think>';
/** longest tag we must be able to recognize split across chunks */
const MAX_TAG_LEN = Math.max(OPEN.length, CLOSE.length);

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

  feed(delta: string): void {
    this.buf += delta;
    this.process();
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

  /** Consume complete tags from the buffer; hold back only a possible partial tag. */
  private process(final = false): void {
    let loop = true;
    while (loop) {
      loop = false;
      if (!this.inThinking) {
        const idx = this.buf.indexOf(OPEN);
        if (idx !== -1) {
          this.content += this.buf.slice(0, idx);
          this.buf = this.buf.slice(idx + OPEN.length);
          this.inThinking = true;
          loop = true;
        }
      } else {
        const idx = this.buf.indexOf(CLOSE);
        if (idx !== -1) {
          this.reasoning += this.buf.slice(0, idx);
          this.buf = this.buf.slice(idx + CLOSE.length);
          this.inThinking = false;
          loop = true;
        }
      }
    }

    if (final) {
      if (this.inThinking) this.reasoning += this.buf;
      else this.content += this.buf;
      this.buf = '';
      return;
    }

    // Hold back a tail that could be the start of a tag split across chunks.
    const hold = partialTagLength(this.buf, this.inThinking ? CLOSE : OPEN);
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

function partialTagLength(tail: string, tag: string): number {
  const max = Math.min(tag.length - 1, tail.length);
  for (let len = max; len > 0; len--) {
    if (tail.endsWith(tag.slice(0, len))) return len;
  }
  return 0;
}
