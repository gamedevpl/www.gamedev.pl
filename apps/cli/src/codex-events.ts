export function codexEventText(value: unknown): string | null | undefined {
  const event = value as {
    type?: string;
    item?: {
      type?: string;
      server?: string;
      tool?: string;
      status?: string;
      error?: { message?: string };
      changes?: { path?: string }[];
    };
  };
  if (typeof event.type !== 'string' || !event.type.startsWith('item.')) return undefined;
  const item = event.item;
  if (item?.type === 'mcp_tool_call') {
    if (event.type !== 'item.completed') return null;
    const name = [item.server, item.tool].filter(Boolean).join(' / ') || 'MCP tool';
    return item.status === 'failed' || item.error
      ? `Tool failed: ${name}${item.error?.message ? ` — ${item.error.message}` : ''}`
      : `✓ ${name}`;
  }
  if (item?.type === 'file_change' && event.type === 'item.completed') {
    const paths = Array.isArray(item.changes)
      ? item.changes
          .map((change) => change?.path)
          .filter(Boolean)
          .join(', ')
      : '';
    return paths ? `Edited: ${paths}` : null;
  }
  if (item?.type === 'agent_message' || item?.type === 'command_execution') return undefined;
  return null;
}
