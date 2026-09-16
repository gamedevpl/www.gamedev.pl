// opencode run --format json emits completed parts, not token deltas.
export function opencodeEventText(value: unknown): string | null | undefined {
  const event = value as {
    type?: unknown;
    part?: { text?: unknown; tool?: unknown; state?: { status?: unknown; error?: unknown } };
    error?: { name?: unknown; data?: { message?: unknown } };
  } | null;
  if (!event || typeof event.type !== 'string') return undefined;
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);
  if (event.type === 'text') return text(event.part?.text);
  if (event.type === 'tool_use') {
    const name = text(event.part?.tool) ?? 'tool';
    return event.part?.state?.status === 'error'
      ? `Tool failed: ${name}: ${text(event.part.state.error) ?? 'unknown tool error'}`
      : `⚙ ${name}`;
  }
  if (event.type === 'error')
    return text(event.error?.data?.message) ?? text(event.error?.name) ?? 'OpenCode task failed';
  if (['step_start', 'step_finish', 'reasoning'].includes(event.type)) return null;
  return undefined;
}
