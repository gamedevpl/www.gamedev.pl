import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { ApprovalRequest } from 'genaicode/agents';

let sessions = new WeakMap<object, Set<string>>();

export function commandApprovalMemory(session: object) {
  return {
    has: (key: string) => sessions.get(session)?.has(key) ?? false,
    add(key: string): void {
      let commands = sessions.get(session);
      if (!commands) sessions.set(session, (commands = new Set()));
      commands.add(key);
    },
  };
}

export function clearCommandApprovals(): void {
  sessions = new WeakMap();
}

export function commandApprovalKey(request: ApprovalRequest, agent: string, cwd: string): string | undefined {
  if (agent !== 'claude' || request.kind !== 'command' || request.scope === 'turn') return undefined;
  const detail = record(request.detail);
  const input = record(detail?.input);
  if (detail?.tool_name !== 'Bash' || typeof input?.command !== 'string' || !input.command.trim()) return undefined;
  // IDs and descriptions change between otherwise identical invocations.
  const fields = (value: Record<string, unknown>, omitted: string) =>
    Object.keys(value)
      .sort()
      .filter((key) => key !== omitted)
      .map((key) => [key, value[key]]);
  const payload = fields({ ...detail, input: fields(input, 'description') }, 'tool_use_id');
  return createHash('sha256')
    .update(JSON.stringify([agent, resolve(cwd), payload]))
    .digest('hex');
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
