import { z } from 'zod';
import { findCredentialLikeStrings } from '../platform/credential-scan.js';

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
const privatePath =
  /(?:^|[^\w.-])(?:\.env|\.aws|\.ssh|credentials|secrets?|creator\.md|\.?(?:agent[-_])?memor(?:y|ies)(?:[-_]stores?)?|memstore_[\w-]+)(?=[^\w-]|$)/i;
const environmentDump = /\b(?:printenv|env|export\s+-p)\b/;

// Redact before truncation so clipping cannot expose a partial credential.
export function activityExcerpt(text: string, limit = 600): string {
  if (findCredentialLikeStrings(text).length) return '[redacted]'.slice(0, limit);
  return text
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, '[redacted]')
    .replace(/\bmcp2_[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?/g, '[redacted]')
    .replace(/\b(?:sk|ghp|github_pat|xoxb|xoxp|member1)[_-][A-Za-z0-9_-]{10,}/g, '[redacted]')
    .replace(/(x-gamedev-stage["']?\s*:\s*)[^\s"'`]+/gi, '$1[redacted]')
    .replace(/\bBearer\s+[^\s"'`]+/gi, 'Bearer [redacted]')
    .replace(
      /((?:x-gamedev-stage|api[_-]?key|session[_-]?key|authorization|password|secret|access[_-]?token|token)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi,
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
      if (
        /^memory(?:_|$)/i.test(String(event.name ?? '')) ||
        Object.values(input).some((v) => typeof v === 'string' && privatePath.test(v)) ||
        environmentDump.test(String(input.command ?? ''))
      )
        continue;
      const details: Record<string, string> = {};
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
  // An unmatched result has no safe context for interpreting or disclosing it.
  const uses = new Set(ordered.filter((e) => e.type === 'agent.tool_use').map((e) => e.id));
  return ordered.filter((e) => e.type !== 'agent.tool_result' || uses.has(e.toolUseId ?? ''));
}
