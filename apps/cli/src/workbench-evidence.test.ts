import { beforeEach, expect, it, vi } from 'vitest';
import { handleReplLine } from './repl.js';
import { chooseExecution, executeChoice } from './execution.js';
import { EVIDENCE_MARKER } from './workbench-evidence.js';
import type { ApiClient } from './api.js';
vi.mock('./execution.js', () => ({ chooseExecution: vi.fn(), executeChoice: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(chooseExecution).mockResolvedValue({ builder: 'self', mode: 'local', spec: { name: 'fixture' } } as never);
});
it('retains local evidence when the intake assistant rewrites the requested change', async () => {
  const api = {
    origin: 'https://example.test',
    request: vi.fn(async (_method: string, path: string, body?: { prepareOnly?: boolean }) => {
      if (path === '/api/cli/chat')
        return { kind: 'action', action: { name: 'edit', request: 'Add a ramp' }, conversationId: 'c' };
      if (path.endsWith('/turn')) return body?.prepareOnly ? { kind: 'proposal' } : { kind: 'build', roundId: 2 };
      return { status: 'building', builder: 'self', slug: 'race' };
    }),
  } as unknown as ApiClient;
  const evidence = EVIDENCE_MARKER + '{"path":"/local/evidence.png"}';
  await handleReplLine({
    line: 'Fix this' + evidence,
    api,
    token: 'round',
    env: { PATH: '' },
    pick: async () => '',
    write: () => {},
  });
  expect(api.request).toHaveBeenCalledWith('POST', '/api/cli/chat', expect.objectContaining({ text: 'Fix this' }));
  expect(chooseExecution).toHaveBeenCalledWith(expect.objectContaining({ localOnly: true }));
  expect(executeChoice).toHaveBeenCalledWith(expect.objectContaining({ request: 'Add a ramp' + evidence }));
});
it('retains local references when a proposal becomes a new game brief', async () => {
  const api = {
    origin: 'https://example.test',
    request: vi.fn(async (_method: string, path: string) =>
      path === '/api/cli/chat'
        ? { kind: 'proposal', title: 'Race', concept: 'Make a racer', conversationId: 'c' }
        : { token: 'round', slug: 'race' },
    ),
  } as unknown as ApiClient;
  const evidence = EVIDENCE_MARKER + '{"path":"/local/reference.png"}';
  await handleReplLine({
    line: 'Make this' + evidence,
    api,
    token: null,
    env: { PATH: '' },
    pick: async () => '',
    write: () => {},
  });
  expect(executeChoice).toHaveBeenCalledWith(expect.objectContaining({ request: 'Make a racer' + evidence }));
});
