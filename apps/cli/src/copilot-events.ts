// Copilot CLI JSON events use data; transport deltas are not conversation messages.
export function copilotEventText(value: unknown): string | null | undefined {
  const event = value as { type?: unknown; data?: Record<string, unknown> } | null;
  if (!event || typeof event.type !== 'string') return undefined;
  const data = event.data ?? {};
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);
  if (event.type === 'assistant.message') return text(data.content);
  if (event.type === 'tool.execution_start') return `⚙ ${text(data.toolName) ?? 'tool'}`;
  if (event.type === 'tool.execution_complete') {
    if (data.success !== false && !data.error) return null;
    const error = data.error as { message?: unknown } | undefined;
    return `Tool failed: ${text(error?.message) ?? text(data.error) ?? 'unknown tool error'}`;
  }
  if (event.type === 'session.error') return text(data.message) ?? 'Copilot session failed';
  if (/^(assistant|tool|session|model|user|permission|hook|system)\./.test(event.type)) return null;
  return undefined;
}
