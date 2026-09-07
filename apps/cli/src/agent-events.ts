type Event = {
  event?: string;
  type?: string;
  step_update?: { step_type?: string; state?: string; tool_name?: string; response?: string };
  result?: { response?: string };
  permission_denials?: unknown[];
};

export function antigravityText(value: unknown): string | null | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const event = value as Event;
  if (event.event === 'init') return 'Local Antigravity task started';
  if (event.event === 'step_update') {
    const step = event.step_update;
    if (step?.step_type === 'tool' && step.tool_name) {
      if (step.state === 'ERROR') return `Tool failed: ${step.tool_name}`;
      if (step.state === 'ACTIVE') return `⚙ ${step.tool_name}`;
    }
    return typeof step?.response === 'string' ? step.response.trim() || null : null;
  }
  if (event.event === 'result')
    return typeof event.result?.response === 'string' ? event.result.response.trim() || null : null;
  return undefined;
}

export function permissionBlocked(line: string): boolean {
  if (line.includes('headless mode cannot prompt') && line.includes('auto-denied')) return true;
  try {
    const event = JSON.parse(line) as Event;
    return event?.type === 'result' && Array.isArray(event.permission_denials) && event.permission_denials.length > 0;
  } catch {
    return false;
  }
}
