import {
  cliAgent,
  createAntigravityParser,
  createClaudeParser,
  createCodexParser,
  createCopilotParser,
  createCursorParser,
  createGeminiParser,
  createMuseParser,
  createOpencodeParser,
  createVibeParser,
  type AgentEvent,
  type AgentOutputParser,
  type CodingAgent,
} from 'genaicode/agents';
import type { AdapterSpec } from './adapters.js';
import { requireClaudeSubscription, subscriptionEnv } from './claude-auth.js';
import type { Steer } from './live-agent.js';
import { evidenceImages } from './workbench-evidence.js';

export type AdapterRunInput = {
  spec: AdapterSpec;
  prompt: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  abort?: AbortSignal;
  // Raw stdout and stderr lines, for transcripts and detectors.
  onLine?: (line: string) => void;
  onEvent?: (event: AgentEvent) => void;
  onDiagnostic?: (line: string) => void;
  authCheck?: Promise<void>;
  onSteering?: (send: Steer | undefined) => void;
};
export type AdapterRun = (input: AdapterRunInput) => Promise<{ code: number | null; permissionSession?: string }>;

const PARSERS: Record<string, () => AgentOutputParser> = {
  claude: createClaudeParser,
  codex: createCodexParser,
  gemini: createGeminiParser,
  vibe: createVibeParser,
  agy: createAntigravityParser,
  cursor: createCursorParser,
  copilot: createCopilotParser,
  muse: createMuseParser,
  opencode: createOpencodeParser,
};

const TEXT_FIELDS = ['text', 'message', 'result', 'content', 'response'];

function errorText(value: Record<string, unknown>): string | undefined {
  const error = value.error;
  const message = typeof error === 'string' ? error : (error as { message?: unknown } | undefined)?.message;
  return typeof message === 'string' && message.trim() ? message : undefined;
}

// Custom adapters: show the first text field of each event.
function genericEvents(value: Record<string, unknown>): AgentEvent[] {
  for (const key of TEXT_FIELDS) {
    const text = value[key];
    if (typeof text === 'string' && text.trim()) return [{ type: 'message', text }];
  }
  return [];
}

// An error the vendor parser does not know stays visible.
export function adapterParser(name: string): AgentOutputParser {
  const parser = PARSERS[name]?.();
  return {
    event(value) {
      const events = parser ? parser.event(value) : [];
      if (events.length || !value || typeof value !== 'object') return events;
      const record = value as Record<string, unknown>;
      const error = errorText(record);
      if (error) return [{ type: 'error', message: error }];
      return parser ? [] : genericEvents(record);
    },
    outcome: () => parser?.outcome?.(),
  };
}

export function headlessArgs(spec: AdapterSpec, prompt: string): string[] {
  const images = spec.name === 'codex' ? evidenceImages(prompt).map((path) => `--image=${path}`) : [];
  return [...spec.headless, ...images, prompt];
}

// Adapter flags drive the CLI; genaicode spawns it and decodes events.
export function headlessAgent(spec: AdapterSpec, onJson?: (line: string) => void): CodingAgent {
  const model = spec.name === 'vibe' ? spec.selection?.model : undefined;
  return cliAgent({
    name: spec.name,
    command: spec.command,
    args: (task) => headlessArgs(spec, task.prompt),
    prepare: (task) => ({
      args: headlessArgs(spec, task.prompt),
      ...(model ? { env: { VIBE_ACTIVE_MODEL: model } } : {}),
    }),
    ...(spec.name === 'claude' ? { env: subscriptionEnv } : {}),
    createParser: () => {
      const parser = adapterParser(spec.name);
      return {
        event: (value) => {
          onJson?.(JSON.stringify(value));
          return parser.event(value);
        },
        outcome: parser.outcome,
      };
    },
  });
}

function lineSplitter(emit: (line: string) => void) {
  let buffered = '';
  return {
    push(text: string) {
      const parts = (buffered + text).split(/\r?\n/);
      buffered = parts.pop() ?? '';
      for (const part of parts) if (part.trim()) emit(part);
    },
    flush() {
      if (buffered.trim()) emit(buffered);
      buffered = '';
    },
  };
}

export async function runHeadlessAgent(
  input: AdapterRunInput & { timeoutMs: number },
): Promise<{ code: number | null }> {
  if (input.spec.name === 'claude')
    await (input.authCheck ??
      requireClaudeSubscription({
        command: input.spec.command,
        cwd: input.cwd,
        env: subscriptionEnv(input.env),
        args: input.spec.headless,
        abort: input.abort,
      }));
  const stderr = lineSplitter((text) => {
    input.onLine?.(text);
    input.onEvent?.({ type: 'stderr', text });
  });
  const run = headlessAgent(input.spec, input.onLine).run({
    prompt: input.prompt,
    cwd: input.cwd,
    env: input.env,
    signal: input.abort,
    timeoutMs: input.timeoutMs,
  });
  const errors = new Set<string>();
  for await (const event of run) {
    if (event.type === 'stderr') stderr.push(event.text);
    else {
      if (event.type === 'error') errors.add(event.message);
      if (event.type === 'raw') input.onLine?.(event.line);
      input.onEvent?.(event);
    }
  }
  stderr.flush();
  const result = await run.result;
  if (result.status === 'aborted' || result.status === 'timeout') return { code: null };
  if (result.ok) return { code: 0 };
  // A CLI that never started has no exit code of its own.
  if (result.error && !errors.has(result.error) && (result.exitCode === null || result.exitCode < 0))
    input.onEvent?.({ type: 'error', message: result.error });
  return { code: result.exitCode && result.exitCode > 0 ? result.exitCode : 1 };
}
