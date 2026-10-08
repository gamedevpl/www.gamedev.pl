import { afterEach, expect, it, vi } from 'vitest';
import { approvalPrompt } from './agent-approval.js';
import { createSessionController } from './session-controller.js';
import { createSessionCommands } from './session-commands.js';
import { startLocalPreviewMcp } from './local-preview-mcp.js';
import { localPreviewAdapter } from './local-preview-adapter.js';
import { loadAdapters } from './adapters.js';

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

function fixture() {
  const abort = new AbortController();
  const session = createSessionController('', () => abort.abort());
  session.setLocalTask('claude');
  const write = vi.fn();
  const approve = approvalPrompt({ agent: 'claude', pick: session.prompt, signal: abort.signal, write });
  cleanup.push(() => {
    abort.abort();
    session.close();
  });
  return { abort, session, write, approve, dispatch: createSessionCommands(session) };
}

it('serializes approvals and rejects stale browser answers without consuming follow-ups', async () => {
  const f = fixture();
  f.session.enqueueInput('next task', f.session.get().taskId);
  const one = f.approve({ id: 'a', kind: 'command', detail: { command: 'npm test' } });
  const two = f.approve({ id: 'b', kind: 'command', detail: { command: 'npm run build' } });
  await vi.waitFor(() => expect(f.session.get().mode).toBe('pick'));
  const first = f.session.get().promptId;
  expect(f.session.get().choices[f.session.get().pickIndex]).toBe('Deny');
  expect(f.dispatch({ id: 'yes', kind: 'input', promptId: first, text: 'Allow once' }).status).toBe('accepted');
  expect(await one).toBe('approve');
  await vi.waitFor(() => expect(f.session.get().promptId).toBeGreaterThan(first));
  expect(f.dispatch({ id: 'stale', kind: 'input', promptId: first, text: 'Allow once' }).status).toBe('stale');
  f.session.cancel();
  expect(await two).toBe('deny');
  expect(f.session.get().queued).toEqual(['next task']);
});

it('cancels an open approval and queued approvals when the task ends', async () => {
  const f = fixture();
  const one = f.approve({ id: 'a', kind: 'command', detail: { command: 'npm test' } });
  const two = f.approve({ id: 'b', kind: 'other' });
  await vi.waitFor(() => expect(f.session.get().mode).toBe('pick'));
  const promptId = f.session.get().promptId;
  expect(f.dispatch({ id: 'stop', kind: 'stop', taskId: f.session.get().taskId }).status).toBe('accepted');
  expect(await Promise.all([one, two])).toEqual(['deny', 'deny']);
  expect(f.session.get().choices).toEqual([]);
  expect(f.session.acceptInput('Allow once', promptId)).toBe(false);
});

it('denies oversized requests instead of approving a truncated command', async () => {
  const f = fixture();
  expect(await f.approve({ id: 'a', kind: 'command', detail: { command: 'x'.repeat(8000) } })).toBe('deny');
  expect(f.session.get().mode).toBe('busy');
});

it.each(['Allow once', 'Deny'])('round-trips Claude MCP permission through the controller: %s', async (answer) => {
  const f = fixture();
  const mcp = await startLocalPreviewMcp({ abort: f.abort.signal, write: f.write, onApproval: f.approve });
  cleanup.push(() => mcp.close());
  const call = (method: string, params = {}) =>
    fetch(mcp.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: mcp.authorization },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }).then((response) => response.json());
  expect((await call('tools/list')).result.tools.map((tool: { name: string }) => tool.name)).toContain('approve');
  const args = { command: 'cd /game && timeout 240 npm run play -- game --replay check.json 2>&1' };
  const pending = call('tools/call', { name: 'approve', arguments: { tool_name: 'Bash', input: args } });
  await vi.waitFor(() => expect(f.session.get().question).toContain(args.command));
  f.session.acceptInput(answer, f.session.get().promptId);
  const result = JSON.parse((await pending).result.content[0].text);
  expect(result.behavior).toBe(answer === 'Allow once' ? 'allow' : 'deny');
  if (answer === 'Allow once') expect(result.updatedInput).toEqual(args);
  const malformed = await call('tools/call', { name: 'approve', arguments: { tool_name: 'Bash' } });
  expect(JSON.parse(malformed.result.content[0].text).behavior).toBe('deny');
  const spec = loadAdapters().adapters.find((adapter) => adapter.name === 'claude')!;
  const wired = localPreviewAdapter(spec, mcp, true);
  cleanup.push(wired.cleanup);
  expect(wired.spec.headless).toContain('--permission-prompt-tool');
  expect(wired.spec.headless).toContain('mcp__gamedevpl_local__approve');
  expect(wired.spec.headless).toContain('acceptEdits');
});

it('removes a Claude approval when its MCP connection closes', async () => {
  const f = fixture();
  const mcp = await startLocalPreviewMcp({ abort: f.abort.signal, write: f.write, onApproval: f.approve });
  cleanup.push(() => mcp.close());
  const disconnected = new AbortController();
  const pending = fetch(mcp.url, {
    method: 'POST',
    signal: disconnected.signal,
    headers: { 'Content-Type': 'application/json', Authorization: mcp.authorization },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'approve',
        arguments: { tool_name: 'Bash', input: { command: 'npm test' } },
      },
    }),
  }).catch(() => undefined);
  await vi.waitFor(() => expect(f.session.get().mode).toBe('pick'));
  disconnected.abort();
  await pending;
  await vi.waitFor(() => expect(f.session.get().choices).toEqual([]));
});

it.each(['Allow for this turn', 'Deny'])('labels turn-scoped permissions explicitly: %s', async (answer) => {
  const f = fixture();
  const pending = f.approve({ id: 'p', kind: 'other', scope: 'turn', detail: { network: { enabled: true } } });
  await vi.waitFor(() => expect(f.session.get().mode).toBe('pick'));
  expect(f.session.get().choices).toEqual(['Deny', 'Allow for this turn']);
  expect(f.session.get().question).toContain('until the current turn ends');
  f.session.acceptInput(answer, f.session.get().promptId);
  expect(await pending).toBe(answer === 'Deny' ? 'deny' : 'approve');
});

it('lets Claude wait for an answer only when it asks through the approve tool', async () => {
  const { approvalEnv } = await import('./agent-approval.js');
  expect(approvalEnv({ PATH: '/bin' }, true).MCP_TOOL_TIMEOUT).toBe('86400000');
  expect(approvalEnv({ PATH: '/bin', MCP_TOOL_TIMEOUT: '5000' }, true).MCP_TOOL_TIMEOUT).toBe('5000');
  expect(approvalEnv({ PATH: '/bin' }, false)).toEqual({ PATH: '/bin' });
});
