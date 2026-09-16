import { expect, it } from 'vitest';
import { parseEventLine, renderDelegateStream } from './delegate.js';

const event = (type: string, data: unknown = {}) => JSON.stringify({ type, data });

it('renders a noisy Copilot run as replies and tool actions, without duplicate deltas', () => {
  const noise = [
    'assistant.tool_call_delta',
    'assistant.message_start',
    'assistant.message_delta',
    'session.background_tasks_changed',
    'tool.execution_partial_result',
    'assistant.turn_end',
    'assistant.turn_start',
    'model.call_start',
  ];
  const lines = [
    ...Array.from({ length: 100 }, (_, i) =>
      event(noise[i % noise.length]!, { content: 'partial', deltaContent: 'partial' }),
    ),
    event('assistant.message', { content: 'I will fix the brakes.' }),
    event('tool.execution_start', { toolName: 'edit' }),
    event('tool.execution_complete', { success: true }),
    event('assistant.message', { content: 'Brakes fixed.' }),
  ];
  expect(renderDelegateStream('copilot', lines, false)).toEqual([
    'copilot ▸ I will fix the brakes.',
    'copilot ▸ ⚙ edit',
    'copilot ▸ Brakes fixed.',
  ]);
  expect(renderDelegateStream('copilot', [lines[0]!], true)[0]).toContain('copilot raw ');
});

it('keeps Copilot failures and plain stderr visible', () => {
  expect(parseEventLine(event('session.error', { message: 'Quota exceeded' }), 'copilot')).toBe('Quota exceeded');
  expect(
    parseEventLine(
      event('tool.execution_complete', { success: false, error: { message: 'Permission denied' } }),
      'copilot',
    ),
  ).toBe('Tool failed: Permission denied');
  expect(parseEventLine(event('tool.execution_complete', { success: false }), 'copilot')).toContain('Tool failed');
  expect(parseEventLine('Login required', 'copilot')).toBe('Login required');
  expect(parseEventLine('{"error":{"message":"Transport failed"}}', 'copilot')).toBe('Transport failed');
});

it('reads completed OpenCode parts and failures while hiding step metadata', () => {
  const parse = (value: unknown) => parseEventLine(JSON.stringify(value), 'opencode');
  expect(parse({ type: 'text', part: { text: 'Fixed the camera' } })).toBe('Fixed the camera');
  expect(parse({ type: 'tool_use', part: { tool: 'edit', state: { status: 'completed' } } })).toBe('⚙ edit');
  expect(
    parse({ type: 'tool_use', part: { tool: 'bash', state: { status: 'error', error: 'Permission denied' } } }),
  ).toBe('Tool failed: bash: Permission denied');
  expect(parse({ type: 'error', error: { name: 'APIError', data: { message: 'Login required' } } })).toBe(
    'Login required',
  );
  for (const type of ['step_start', 'step_finish', 'reasoning'])
    expect(parse({ type, part: { text: 'hidden' } })).toBeNull();
});
