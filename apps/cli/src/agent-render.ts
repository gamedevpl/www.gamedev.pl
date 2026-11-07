import type { AgentEvent } from 'genaicode/agents';
import { formatAdapterEvent, sanitizeEventPayload } from './ansi.js';

const SESSION_ID = /^[a-f0-9-]{36}$/i;
const DELTA_FLUSH = 240;

function toolLabel(event: Extract<AgentEvent, { type: 'tool-start' }>): string {
  const command = (event.input as { command?: unknown } | undefined)?.command;
  if (event.name === 'shell' && typeof command === 'string' && command.trim()) return command;
  return event.name;
}

// Claude lists denied tools on its result; the run may succeed.
function claudeDenials(line: string): boolean {
  try {
    const value = JSON.parse(line) as { type?: unknown; permission_denials?: unknown };
    return value?.type === 'result' && Array.isArray(value.permission_denials) && value.permission_denials.length > 0;
  } catch {
    return false;
  }
}

function resetHint(resetsAt: number | undefined): string {
  if (resetsAt === undefined) return '';
  const minutes = Math.max(0, Math.round((resetsAt - Date.now()) / 60_000));
  if (minutes < 60) return `, resets in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `, resets in ${hours} h` : `, resets ${new Date(resetsAt).toLocaleDateString()}`;
}

// A plan limit close to running out, or already out.
function limitLine(event: Extract<AgentEvent, { type: 'rate-limit' }>): string | undefined {
  const { limit } = event;
  if (limit.status === 'ok') return;
  const name = limit.name ? `${limit.name} ` : '';
  const used = limit.usedPercent === undefined ? '' : ` (${Math.round(limit.usedPercent)}% used)`;
  if (limit.window === 'quota') return `${name}usage limit reached${resetHint(limit.resetsAt)}`;
  const state = limit.status === 'exceeded' ? 'reached' : 'nearly used up';
  return `${name}${limit.window} usage limit ${state}${used}${resetHint(limit.resetsAt)}`;
}

// Terminal lines for one run's events, prefixed with the adapter.
export function createEventRenderer(adapter: string) {
  let buffered = '';
  let streamed = '';
  let lastMessage: string | undefined;
  let session: string | undefined;
  const started = new Set<string>();

  const shown = (texts: (string | undefined)[]) =>
    texts.filter((text): text is string => Boolean(text?.trim())).map((text) => formatAdapterEvent(adapter, text));
  const drain = (all: boolean): string | undefined => {
    const end = all ? buffered.length : buffered.lastIndexOf('\n') + 1;
    if (!all && !end && buffered.length < DELTA_FLUSH) return undefined;
    const text = end ? buffered.slice(0, end) : buffered;
    buffered = end ? buffered.slice(end) : '';
    return text.trim() || undefined;
  };
  const asked = new Map<string, string>();
  const limits = new Set<string>();
  const text = (event: AgentEvent): string | undefined => {
    switch (event.type) {
      case 'session':
        if (adapter !== 'claude' || !SESSION_ID.test(event.sessionId) || session === event.sessionId) return;
        session = event.sessionId;
        return `Local session ${session} — after it finishes, resume with claude --resume ${session} in the game directory`;
      case 'message':
        if (streamed && event.text.trim() === streamed.trim()) return;
        if (event.text === lastMessage) return;
        lastMessage = event.text;
        return event.text;
      case 'tool-start':
        started.add(event.id ?? '');
        return `⚙ ${toolLabel(event)}`;
      case 'tool-end':
        // A tool-end without a tool-start still names the tool.
        if (!event.isError) return event.name && !started.has(event.id ?? '') ? `⚙ ${event.name}` : undefined;
        if (event.name === 'shell') return;
        return `Tool failed: ${event.name ?? 'tool'}${event.output?.trim() ? ` — ${sanitizeEventPayload(event.output, 500)}` : ''}`;
      case 'file-change':
        return `Edited: ${event.paths.join(', ')}`;
      case 'approval-request':
        asked.set(event.request.id, event.request.summary ?? event.request.kind);
        return;
      // Prompts the creator answers are reported where they are asked.
      case 'approval-resolved':
        if (!event.automatic) return;
        return `Permission ${event.decision === 'approve' ? 'auto-approved' : 'denied by policy'}: ${sanitizeEventPayload(asked.get(event.id) ?? event.id, 200)}`;
      case 'rate-limit': {
        const key = `${event.limit.name ?? ''}/${event.limit.window}/${event.limit.status}`;
        if (limits.has(key)) return;
        limits.add(key);
        return limitLine(event);
      }
      case 'budget-warning': {
        const { kind, used, limit } = event.warning;
        const share = Math.round((used / limit) * 100);
        return kind === 'tokens'
          ? `Token budget ${share}% used (${used} of ${limit})`
          : `Cost budget ${share}% used ($${used.toFixed(2)} of $${limit})`;
      }
      case 'error':
        return event.message;
      case 'stderr':
        return event.text.slice(0, 8000);
      case 'raw':
        return event.line;
      default:
        return undefined;
    }
  };

  return {
    event(event: AgentEvent): string[] {
      if (event.type === 'text-delta') {
        buffered += event.text;
        streamed += event.text;
        return shown([drain(false)]);
      }
      const rest = event.type === 'usage' || event.type === 'approval-resolved' ? undefined : drain(true);
      const line = text(event);
      if (event.type === 'message') streamed = '';
      return shown([rest, line]);
    },
    // Raw stdout lines carry details the events leave out.
    line(raw: string): string[] {
      if (adapter !== 'claude' || !claudeDenials(raw)) return [];
      return shown(['Some tools were denied; this alone does not mean the task failed.']);
    },
    flush(): string[] {
      return shown([drain(true)]);
    },
  };
}

export function renderEvents(adapter: string, events: AgentEvent[]): string[] {
  const render = createEventRenderer(adapter);
  return [...events.flatMap((event) => render.event(event)), ...render.flush()];
}
