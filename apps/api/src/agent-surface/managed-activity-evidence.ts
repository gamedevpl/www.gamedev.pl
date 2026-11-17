import { z } from 'zod';

export interface ActivityEvidence {
  id: string;
  at: string;
  type: string;
  tool?: string;
  toolUseId?: string;
  failed?: boolean;
  details?: Record<string, string>;
}

const Event = z.object({
  id: z.string().min(1).max(200),
  processed_at: z.iso.datetime({ offset: true }),
  type: z.string(),
});
const privatePath = /(?:^|[/\\\s])(?:\.env|\.aws|\.ssh|credentials|secrets?)(?=[/\\.\s"'`]|$)/i;

// Redact before truncation so clipping cannot expose a partial credential.
export function activityExcerpt(text: string, limit = 600): string {
  return text
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[redacted]')
    .replace(/\b(?:sk|ghp|github_pat|xoxb|xoxp)[_-][A-Za-z0-9_-]{10,}/g, '[redacted]')
    .replace(/\bBearer\s+[^\s"'`]+/gi, 'Bearer [redacted]')
    .replace(
      /((?:api[_-]?key|session[_-]?key|authorization|password|secret|access[_-]?token|token)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi,
      '$1[redacted]',
    )
    .replace(/https?:\/\/[^\s"'`]+/g, '[url]')
    .slice(0, limit);
}

// Only local tool evidence; MCP replies can contain round credentials.
export function activityEvidence(events: unknown[], since?: string, now = Date.now()): ActivityEvidence[] {
  const result: ActivityEvidence[] = [];
  for (const value of events) {
    const parsed = Event.safeParse(value);
    if (!parsed.success) continue;
    const event = value as Record<string, unknown>;
    const { id, processed_at: at, type } = parsed.data;
    const time = Date.parse(at);
    if (time < Math.max(now - 90_000, Date.parse(since ?? '') || 0) || time > now + 5000) continue;
    if (type === 'agent.tool_use') {
      const input = event.input && typeof event.input === 'object' ? (event.input as Record<string, unknown>) : {};
      const path = String(input.path ?? input.file_path ?? '');
      const details: Record<string, string> = {};
      if (
        privatePath.test(path) ||
        privatePath.test(String(input.command ?? '')) ||
        /\bprintenv\b/.test(String(input.command ?? ''))
      )
        details.path = '[private file]';
      else
        for (const key of ['path', 'file_path', 'command', 'pattern', 'content', 'new_string', 'new_str']) {
          if (typeof input[key] === 'string') details[key] = activityExcerpt(input[key]);
        }
      result.push({ id, at, type, tool: String(event.name ?? 'tool').slice(0, 60), details });
    } else if (type === 'agent.tool_result') {
      const blocks = Array.isArray(event.content) ? event.content : [];
      const text = blocks
        .filter((b) => b?.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n');
      result.push({
        id,
        at,
        type,
        toolUseId: String(event.tool_use_id ?? '').slice(0, 200),
        failed: event.is_error === true,
        details: { result: activityExcerpt(text) },
      });
    }
  }
  const ordered = result.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-12);
  while (JSON.stringify(ordered).length > 8000) ordered.shift();
  const privateUses = new Set(ordered.filter((e) => e.details?.path === '[private file]').map((e) => e.id));
  // An unmatched result has no safe context for interpreting or disclosing it.
  const uses = new Set(ordered.filter((e) => e.type === 'agent.tool_use').map((e) => e.id));
  return ordered.filter(
    (e) => e.type !== 'agent.tool_result' || (uses.has(e.toolUseId ?? '') && !privateUses.has(e.toolUseId ?? '')),
  );
}
