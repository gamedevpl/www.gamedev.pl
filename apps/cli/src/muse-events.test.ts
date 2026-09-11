import { expect, it } from 'vitest';
import { createDelegateStream, parseEventLine } from './delegate.js';
const event = (payload_type: string, payload = {}) => JSON.stringify({ schema_version: 1, payload_type, payload });
it('streams Muse operations and text without internal envelopes or duplicate final output', () => {
  const render = createDelegateStream('muse');
  expect(render(event('runtime.command.accepted'))).toEqual([]);
  expect(render(event('turn.input.user', { prompt: 'private prompt' }))).toEqual([]);
  expect(render(event('run.lifecycle.started')).join()).toContain('Task started');
  expect(
    render(event('task.lifecycle.side_effect_intent', { event: { operation: 'model.meta.response' } })).join(),
  ).toContain('Waiting for model response');
  expect(
    render(event('task.lifecycle.side_effect_intent', { event: { operation: 'workspace.read_file' } })).join(),
  ).toContain('⚙ workspace.read_file');
  expect(render(event('run.output.delta', { text: 'I am reading ' }))).toEqual([]);
  expect(render(event('run.output.delta', { text: 'the game.\nEditing' })).join()).toContain('I am reading the game.');
  const end = render(event('run.terminal.completed', { text: 'I am reading the game.\nEditing' })).join();
  expect(end).toContain('Editing');
  expect(end).not.toContain('reading');
});
it('reports terminal failure and still handles plain startup diagnostics', () => {
  const render = createDelegateStream('muse');
  expect(render('muse: workspace trust: trusted').join()).toContain('workspace trust');
  const failed = event('run.terminal.failed', { reason: 'permission denied' });
  expect(render(failed).join()).toContain('Task failed: permission denied');
  expect(parseEventLine(failed, 'muse')).toContain('permission denied');
  expect(render(event('future.internal.event', { secret: 'hidden' }))).toEqual([]);
});
it('emits long text before completion even without a newline', () => {
  const render = createDelegateStream('muse');
  expect(render(event('run.output.delta', { text: 'x'.repeat(250) }))).toHaveLength(1);
  expect(render(event('run.terminal.completed', { text: 'x'.repeat(250) }))).toEqual([]);
});
