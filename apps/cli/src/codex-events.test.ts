import { expect, it } from 'vitest';
import { parseEventLine } from './delegate.js';
it('renders MCP outcomes and edited files without opaque item events', () => {
  const line = (item: unknown) => JSON.stringify({ type: 'item.completed', item });
  expect(
    parseEventLine(
      line({ type: 'mcp_tool_call', server: 'gamedevpl', tool: 'report_progress', status: 'completed' }),
      'codex',
    ),
  ).toBe('✓ gamedevpl / report_progress');
  expect(
    parseEventLine(
      line({ type: 'mcp_tool_call', tool: 'end', status: 'failed', error: { message: 'approval denied' } }),
      'codex',
    ),
  ).toBe('Tool failed: end — approval denied');
  expect(parseEventLine(line({ type: 'file_change', changes: [{ path: 'game.ts' }] }), 'codex')).toBe(
    'Edited: game.ts',
  );
  expect(parseEventLine(line({ type: 'future_bookkeeping' }), 'codex')).toBeNull();
  expect(parseEventLine(line({ type: 'agent_message', text: 'Done' }), 'codex')).toBe('Done');
});
