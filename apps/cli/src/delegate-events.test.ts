import { expect, it } from 'vitest';
import { parseEventLine } from './delegate.js';

it('hides empty and unsupported Codex item events without losing useful output', () => {
  for (const type of ['item.completed', 'item.updated']) {
    expect(parseEventLine(JSON.stringify({ type }), 'codex')).toBeNull();
    expect(parseEventLine(JSON.stringify({ type, item: { type: 'todo_list', items: [] } }), 'codex')).toBeNull();
    expect(
      parseEventLine(JSON.stringify({ type, item: { type: 'agent_message', text: 'Read game files' } }), 'codex'),
    ).toBe('Read game files');
  }
  expect(parseEventLine('{"type":"item.completed","error":{"message":"Model unavailable"}}', 'codex')).toBe(
    'Model unavailable',
  );
  expect(
    parseEventLine(
      JSON.stringify({ type: 'item.completed', item: { type: 'error', message: 'Falling back to HTTPS transport' } }),
      'codex',
    ),
  ).toBe('Falling back to HTTPS transport');
});
