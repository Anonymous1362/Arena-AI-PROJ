/**
 * The agent loop: streaming chat completions + OpenAI tool calling.
 *
 * Behavior contract:
 *  - Streams text into the transcript live (same UX as normal chat).
 *  - Detects [PLAN] blocks and surfaces them as structured, icon-tagged steps.
 *  - Executes tool calls as they arrive, shows each execution as a terminal /
 *    tool event card, then continues the turn with results fed back.
 *  - Auto-continues when a provider truncates (finish_reason=length /
 *    tool_calls at cap) — up to hard caps — so work never silently stops.
 *  - Emits everything through callbacks so the UI stays pure.
 */
import type { WireMessage, PlanStep, ToolEvent } from '@/src/ai/types';
import { streamRemoteChat, ApiError } from '@/src/ai/remote';
import type { RemoteTarget } from '@/src/ai/types';
import { dispatchTool, openAITools } from '@/src/agent/tools';
import { CONTINUE_NUDGE } from '@/src/agent/prompts';
import { useConfirmStore } from '@/src/agent/confirm';
import { haptics } from '@/src/utils/haptics';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type { PlanStep, ToolEvent };

export interface LoopCallbacks {
  onText: (fullText: string) => void;
  onReasoning?: (reasoning: string) => void;
  onPlan: (steps: PlanStep[]) => void;
  onToolEvent: (ev: ToolEvent) => void;
  /** Fires with the final text + events when the whole turn settles. */
  onDone: (result: {
    text: string;
    toolEvents: ToolEvent[];
    steps: PlanStep[];
    ms: number;
    stopReason: 'complete' | 'max_turns' | 'aborted';
    /** Transcript without the system prompt — persist to resume tool context. */
    transcriptTail: WireMessage[];
    toolCallCount: number;
    tokensIn: number;
    tokensOut: number;
  }) => void;
  onError: (err: Error) => void;
}

export interface LoopOptions {
  target: RemoteTarget;
  messages: WireMessage[];
  systemPrompt: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  callbacks: LoopCallbacks;
  /** Hard limits so a runaway agent can't loop forever. */
  maxToolCalls?: number;
  maxTurns?: number;
  /** Auto-continue when the provider truncates mid-answer (finish=length). */
  autoContinue?: boolean;
  /** Ask the user before destructive tools (delete etc.). */
  confirmDangerous?: boolean;
}

interface ParsedTurn {
  text: string;
  plan: PlanStep[];
}

const OPEN = '[PLAN]';
const CLOSE = '[/PLAN]';

/** Pull the newest [PLAN] block out of the running text. */
function extractPlan(text: string): ParsedTurn {
  const openIdx = text.lastIndexOf(OPEN);
  if (openIdx === -1) return { text, plan: [] };
  const closeIdx = text.indexOf(CLOSE, openIdx);
  const body = closeIdx === -1 ? text.slice(openIdx + OPEN.length) : text.slice(openIdx + OPEN.length, closeIdx);
  const steps: PlanStep[] = [];
  for (const rawLine of body.split('\n')) {
    const m = rawLine.trim().match(/^\d+[.)]?\s+(.+)$/);
    if (m && m[1].trim()) {
      steps.push({ id: `s${steps.length + 1}`, label: m[1].trim(), state: 'pending' });
    }
  }
  return { text, plan: steps };
}

function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function runAgentTurn(opts: LoopOptions): Promise<void> {
  const {
    target,
    systemPrompt,
    temperature = 0.7,
    topP = 0.95,
    maxTokens = 4096,
    signal,
    callbacks,
  } = opts;
  const maxToolCalls = opts.maxToolCalls ?? 25;
  const maxTurns = opts.maxTurns ?? 8;

  const started = Date.now();
  const toolEvents: ToolEvent[] = [];
  let tokensInTotal = 0;
  let tokensOutTotal = 0;
  let fullText = '';
  let steps: PlanStep[] = [];
  let toolCallCount = 0;
  let stopReason: 'complete' | 'max_turns' | 'aborted' = 'complete';

  // The working message list; system prompt first.
  const working: WireMessage[] = [{ role: 'system', content: systemPrompt }, ...opts.messages];

  const pushEvent = (ev: ToolEvent) => {
    toolEvents.push(ev);
    callbacks.onToolEvent(ev);
  };

  const markPlanProgress = (text: string) => {
    // Detect "**1/4 Step name**" progress markers to update plan states.
    const m = [...text.matchAll(/\*\*(\d+)\/(\d+)\s+([^*]+)\*\*/g)].pop();
    if (m && steps.length) {
      const idx = Number(m[1]) - 1;
      const prevDoneCount = steps.filter((s) => s.state === 'done').length;
      steps = steps.map((s, i) => ({
        ...s,
        state: i < idx ? 'done' : i === idx ? 'active' : s.state === 'done' ? 'done' : 'pending',
      }));
      const newDoneCount = steps.filter((s) => s.state === 'done').length;
      // Fire a haptic for each newly-completed step.
      if (newDoneCount > prevDoneCount) haptics.success();
      callbacks.onPlan([...steps]);
    }
  };

  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      const turnTextBefore = fullText;

      // One automatic retry for transient provider errors (429/5xx) when
      // nothing has streamed yet — keeps long agent runs alive.
      let result: Awaited<ReturnType<typeof streamRemoteChat>> | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          result = await streamRemoteChat(target, {
            messages: working,
            params: {
              temperature,
              topP,
              maxTokens,
              systemPrompt,
            },
            tools: openAITools(),
            signal,
            handlers: {
              onContent: (content) => {
                fullText = content;
                const parsed = extractPlan(content);
                if (parsed.plan.length && JSON.stringify(parsed.plan) !== JSON.stringify(steps)) {
                  // preserve done states when re-emitting a revised plan
                  steps = parsed.plan.map((s, i) => ({
                    ...s,
                    state: steps[i]?.state === 'done' ? 'done' : s.state,
                  }));
                  callbacks.onPlan([...steps]);
                }
                markPlanProgress(content);
                callbacks.onText(stripPlan(content));
              },
              onReasoning: (r) => callbacks.onReasoning?.(r),
            },
          });
          break;
        } catch (e) {
          const transient =
            e instanceof ApiError && (e.status === 429 || e.status === 502 || e.status === 503);
          const nothingYet = fullText === turnTextBefore;
          if (attempt === 0 && transient && nothingYet) {
            await new Promise<void>((r) => setTimeout(r, (e as ApiError).status === 429 ? 4000 : 2500));
            continue;
          }
          throw e;
        }
      }
      if (!result) break;

      tokensInTotal += result.tokensIn ?? 0;
      tokensOutTotal += result.tokensOut ?? 0;
      fullText = stripPlan(result.content);
      callbacks.onText(fullText);

      // No tool calls requested this turn → turn chain ends here.
      const toolCalls: any[] = (result as any).toolCalls ?? [];
      const finish = (result as any).finishReason;

      if (!toolCalls.length) {
        const limited = finish === 'length';
        if (limited && opts.autoContinue !== false && turn < maxTurns - 1) {
          // Provider truncated mid-answer → auto-continue.
          working.push({ role: 'assistant', content: result.content });
          working.push({ role: 'user', content: CONTINUE_NUDGE });
          callbacks.onText(fullText + '\n\n*…continuing*');
          continue;
        }
        break;
      }

      // Execute each tool call, feed results back, loop.
      working.push({
        role: 'assistant',
        content: result.content || '',
        ...(toolCalls.length
          ? ({ tool_calls: toolCalls.map((tc) => tc.raw ?? tc) } as any)
          : {}),
      } as WireMessage);

      for (const call of toolCalls) {
        if (toolCallCount >= maxToolCalls) {
          stopReason = 'max_turns';
          break;
        }
        toolCallCount++;
        const fnName = call.name;
        const args = call.arguments ?? '{}';

        const isCommand = fnName === 'run_command';
        let parsedArgs: any = {};
        try {
          parsedArgs = JSON.parse(args || '{}');
        } catch {
          /* keep empty */
        }

        // Confirmation gate for destructive actions.
        if (opts.confirmDangerous && (fnName === 'delete_path' || (isCommand && /\brm\s+-rf?\b/.test(String(parsedArgs.command ?? ''))))) {
          const allowed = await new Promise<boolean>((resolve) => {
            useConfirmStore.getState().push({
              id: uid(),
              toolName: fnName,
              summary:
                fnName === 'delete_path'
                  ? `The agent wants to delete “${parsedArgs.path ?? '?'}”`
                  : `The agent wants to run: ${parsedArgs.command ?? '?'}`,
              argsPreview: args,
              resolve,
            });
          });
          if (!allowed) {
            working.push({
              role: 'tool',
              content: 'The user declined this action. Choose a different approach and continue the task.',
              ...({ tool_call_id: call.id ?? fnName } as any),
            } as WireMessage);
            pushEvent({
              id: uid(),
              kind: isCommand ? 'command' : 'tool',
              title: isCommand ? String(parsedArgs.command ?? 'command') : fnName,
              detail: '',
              output: 'Denied by user.',
              ok: false,
              running: false,
              ts: Date.now(),
            });
            continue;
          }
        }

        const ev: ToolEvent = {
          id: uid(),
          kind: isCommand ? 'command' : 'tool',
          title: isCommand ? (parsedArgs.command ?? 'command') : fnName,
          detail: isCommand ? '$ ' : '',
          output: '',
          ok: true,
          running: true,
          ts: Date.now(),
        };
        pushEvent({ ...ev });

        const res = await dispatchTool(fnName, args);
        pushEvent({ ...ev, running: false, ok: res.ok, output: res.output });

        working.push({
          role: 'tool',
          content: res.output.slice(0, 16_000) || (res.ok ? 'ok' : 'error'),
          ...(isCommand ? {} : {}),
          ...( { tool_call_id: call.id ?? fnName } as any),
        } as WireMessage);
      }

      if (stopReason === 'max_turns') {
        working.push({ role: 'user', content: CONTINUE_NUDGE });
        continue;
      }
      // continue looping — the model now sees tool outputs
    }

    const finalSteps = steps.map((s) => ({ ...s, state: s.state === 'active' ? 'done' : s.state } as PlanStep));
    // If the plan had steps and they're all done, fire a completion haptic.
    if (finalSteps.length > 0 && finalSteps.every((s) => s.state === 'done')) {
      haptics.success();
    }

    callbacks.onDone({
      text: fullText,
      toolEvents,
      steps: finalSteps,
      ms: Date.now() - started,
      stopReason,
      transcriptTail: working.slice(1),
      toolCallCount,
      tokensIn: tokensInTotal,
      tokensOut: tokensOutTotal,
    });
  } catch (e) {
    const err = e as Error;
    if (err?.name === 'AbortError' || (signal?.aborted ?? false)) {
      callbacks.onDone({
        text: fullText,
        toolEvents,
        steps,
        ms: Date.now() - started,
        stopReason: 'aborted',
        transcriptTail: working.slice(1),
        toolCallCount,
        tokensIn: tokensInTotal,
        tokensOut: tokensOutTotal,
      });
      return;
    }
    callbacks.onError(err instanceof Error ? err : new Error(String(e)));
  }
}

/** Remove [PLAN] blocks from display text (they render as the plan panel). */
export function stripPlan(text: string): string {
  return text
    .replace(/\[PLAN\][\s\S]*?(\[\/PLAN\]|$)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+/, '');
}
