import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import type { AgentEvent } from 'genaicode/agents';
import { createEventRenderer, renderEvents } from './agent-render.js';
import { adapterParser } from './headless-agent.js';

// Recorded stdout lines through the adapter parser, like a headless run.
function render(adapter: string, rows: unknown[]): string[] {
  const parser = adapterParser(adapter);
  const renderer = createEventRenderer(adapter);
  const out: string[] = [];
  for (const row of rows) {
    const line = typeof row === 'string' ? row : JSON.stringify(row);
    let events: AgentEvent[];
    try {
      events = parser.event(JSON.parse(line));
    } catch {
      events = [{ type: 'raw', line }];
    }
    out.push(...renderer.line(line));
    for (const event of events) out.push(...renderer.event(event));
  }
  return [...out, ...renderer.flush()].map((line) => line.slice(`${adapter} ▸ `.length));
}

it('renders untrusted text as adapter-owned inert lines', () => {
  const fixture = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'hostile-delegate.ndjson'),
    'utf8',
  ).trim();
  const lines = createEventRenderer('custom');
  const parser = adapterParser('custom');
  const shown = fixture
    .split('\n')
    .flatMap((line) => parser.event(JSON.parse(line)).flatMap((event) => lines.event(event)));
  expect(shown.length).toBeGreaterThan(0);
  for (const line of shown) {
    expect(line.startsWith('custom ▸ ')).toBe(true);
    expect(line.includes(String.fromCharCode(27))).toBe(false);
  }
  expect(shown.join('\n')).not.toMatch(/^✓ preview green$/m);
});

it('renders a Copilot run as replies and tool actions, without duplicate deltas', () => {
  const event = (type: string, data: unknown = {}) => ({ type, data });
  expect(
    render('copilot', [
      event('assistant.turn_start'),
      event('assistant.message_delta', { deltaContent: 'I will fix ' }),
      event('assistant.message_delta', { deltaContent: 'the brakes.' }),
      event('assistant.message', { content: 'I will fix the brakes.' }),
      event('session.background_tasks_changed'),
      event('tool.execution_start', { toolCallId: 't1', toolName: 'edit' }),
      event('tool.execution_complete', { toolCallId: 't1', success: true }),
      event('assistant.message', { content: 'Brakes fixed.' }),
    ]),
  ).toEqual(['I will fix the brakes.', '⚙ edit', 'Brakes fixed.']);
});

it('keeps Copilot failures and plain stderr visible', () => {
  const event = (type: string, data: unknown = {}) => ({ type, data });
  expect(render('copilot', [event('session.error', { message: 'Quota exceeded' })])).toEqual(['Quota exceeded']);
  expect(
    render('copilot', [event('tool.execution_complete', { success: false, error: { message: 'Permission denied' } })]),
  ).toEqual(['Tool failed: tool — Permission denied']);
  expect(render('copilot', ['Login required'])).toEqual(['Login required']);
  expect(render('copilot', [{ error: { message: 'Transport failed' } }])).toEqual(['Transport failed']);
});

it('reads completed OpenCode parts and failures while hiding step metadata', () => {
  expect(
    render('opencode', [
      { type: 'step_start', part: { text: 'hidden' } },
      { type: 'text', part: { text: 'Fixed the camera' } },
      { type: 'tool_use', part: { tool: 'edit', state: { status: 'completed' } } },
      { type: 'tool_use', part: { tool: 'bash', state: { status: 'error', error: 'Permission denied' } } },
      { type: 'reasoning', part: { text: 'hidden' } },
      { type: 'error', error: { name: 'APIError', data: { message: 'Login required' } } },
      { type: 'step_finish', part: { text: 'hidden' } },
    ]),
  ).toEqual(['Fixed the camera', '⚙ edit', 'Tool failed: bash — Permission denied', 'Login required']);
});

it('renders Codex commands, MCP outcomes and edited files without opaque item events', () => {
  const item = (type: string, value: unknown) => ({ type, item: value });
  expect(
    render('codex', [
      { type: 'thread.started', thread_id: 't' },
      item('item.started', { id: 'c', type: 'command_execution', command: 'npm test' }),
      item('item.completed', { id: 'c', type: 'command_execution', exit_code: 1, aggregated_output: 'noise' }),
      item('item.started', { id: 'm', type: 'mcp_tool_call', server: 'gamedevpl', tool: 'report_progress' }),
      item('item.completed', { id: 'm', type: 'mcp_tool_call', server: 'gamedevpl', tool: 'report_progress' }),
      item('item.completed', { type: 'mcp_tool_call', tool: 'end', status: 'failed', error: { message: 'denied' } }),
      item('item.completed', { type: 'file_change', changes: [{ path: 'game.ts' }] }),
      item('item.updated', { type: 'todo_list', items: [] }),
      item('item.completed', { type: 'error', message: 'Falling back to HTTPS transport' }),
      item('item.completed', { type: 'agent_message', text: 'Done' }),
      { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } },
    ]),
  ).toEqual([
    '⚙ npm test',
    '⚙ gamedevpl/report_progress',
    'Tool failed: end — denied',
    'Edited: game.ts',
    'Falling back to HTTPS transport',
    'Done',
  ]);
});

it('streams Muse operations and text without internal envelopes or duplicate final output', () => {
  const event = (payload_type: string, payload = {}) => ({ schema_version: 1, payload_type, payload });
  expect(
    render('muse', [
      event('runtime.command.accepted'),
      event('turn.input.user', { prompt: 'private prompt' }),
      event('task.lifecycle.side_effect_intent', { event: { operation: 'model.meta.response' } }),
      event('task.lifecycle.side_effect_intent', { event: { operation: 'workspace.read_file' } }),
      event('run.output.delta', { text: 'I am reading ' }),
      event('run.output.delta', { text: 'the game.\nEditing' }),
      event('run.terminal.completed', { text: 'I am reading the game.\nEditing' }),
    ]),
  ).toEqual(['⚙ workspace.read_file', 'I am reading the game.', 'Editing']);
  expect(
    render('muse', ['muse: workspace trust: trusted', event('run.terminal.failed', { reason: 'denied' })]),
  ).toEqual(['muse: workspace trust: trusted', 'Muse run failed: denied']);
});

it('emits long streamed text before completion even without a newline', () => {
  const renderer = createEventRenderer('muse');
  expect(renderer.event({ type: 'text-delta', text: 'x'.repeat(250) })).toHaveLength(1);
  expect(renderer.event({ type: 'message', text: 'x'.repeat(250) })).toEqual([]);
});

it('renders Antigravity tools without exposing transport JSON', () => {
  const output = render('agy', [
    { event: 'init', init: { cwd: '/private/path' } },
    {
      event: 'step_update',
      step_update: { step_index: 1, step_type: 'tool', tool_name: 'read_file', state: 'ACTIVE' },
    },
    { event: 'step_update', step_update: { step_index: 1, step_type: 'tool', tool_name: 'read_file', state: 'ERROR' } },
    { event: 'result', result: { status: 'SUCCESS', response: '' } },
  ]);
  expect(output).toEqual(['⚙ read_file', 'Tool failed: read_file']);
});

it('announces each Claude session once, only for the Claude adapter', () => {
  const session_id = '12345678-1234-1234-1234-123456789abc';
  const init = { type: 'system', subtype: 'init', session_id };
  const tool = { type: 'assistant', session_id, message: { content: [{ type: 'tool_use', name: 'Bash' }] } };
  const shown = render('claude', [init, init, tool]);
  expect(shown).toHaveLength(2);
  expect(shown[0]).toContain(`claude --resume ${session_id}`);
  expect(shown[1]).toBe('⚙ Bash');
  expect(render('cursor', [init]).join('')).not.toContain('claude');
});

it('keeps one Claude answer and notes denied tools', () => {
  const text = { type: 'assistant', message: { content: [{ type: 'text', text: 'OK' }] } };
  expect(
    render('claude', [
      text,
      { type: 'rate_limit_event', rate_limit_info: { status: 'allowed' } },
      { type: 'result', subtype: 'success', result: 'OK', permission_denials: [{ tool_name: 'Bash' }] },
    ]),
  ).toEqual(['OK', 'Some tools were denied; this alone does not mean the task failed.']);
});

it('renders events from a live session the same way', () => {
  expect(
    renderEvents('codex', [
      { type: 'text-delta', text: 'Checking' },
      { type: 'tool-start', name: 'shell', input: { command: 'ls' } },
      { type: 'file-change', paths: ['a.ts', 'b.ts'] },
      { type: 'message', text: 'Checking' },
      { type: 'stderr', text: 'warning' },
    ]),
  ).toEqual(['codex ▸ Checking', 'codex ▸ ⚙ ls', 'codex ▸ Edited: a.ts, b.ts', 'codex ▸ warning']);
});
