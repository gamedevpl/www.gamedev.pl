import { afterEach, expect, it } from 'vitest';
import type { ApprovalRequest } from 'genaicode/agents';
import { clearCommandApprovals, commandApprovalKey, commandApprovalMemory } from './agent-approval-memory.js';

afterEach(clearCommandApprovals);

const request: ApprovalRequest = {
  id: 'a',
  kind: 'command',
  scope: 'once',
  detail: {
    tool_name: 'Bash',
    input: { command: 'npm test', timeout: 30000, description: 'Run tests' },
    tool_use_id: 'a',
  },
};

it('matches exact execution options despite changing IDs, descriptions and property order', () => {
  const key = commandApprovalKey(request, 'claude', '/game');
  expect(key).toHaveLength(64);
  expect(
    commandApprovalKey(
      {
        ...request,
        id: 'b',
        detail: {
          tool_use_id: 'b',
          input: { description: 'Check again', timeout: 30000, command: 'npm test' },
          tool_name: 'Bash',
        },
      },
      'claude',
      '/game',
    ),
  ).toBe(key);
});

it.each([
  { command: 'npm test && npm run deploy', timeout: 30000 },
  { command: 'npm test ', timeout: 30000 },
  { command: 'npm test', timeout: 60000 },
  { command: 'npm test', timeout: 30000, dangerouslyDisableSandbox: true },
  { command: 'npm test', timeout: 30000, run_in_background: true },
])('does not share a rule with changed execution input: %j', (input) => {
  expect(commandApprovalKey({ ...request, detail: { tool_name: 'Bash', input } }, 'claude', '/game')).not.toBe(
    commandApprovalKey(request, 'claude', '/game'),
  );
});

it('separates working directories and vendor-supplied context', () => {
  const key = commandApprovalKey(request, 'claude', '/game');
  expect(commandApprovalKey(request, 'claude', '/other-game')).not.toBe(key);
  expect(
    commandApprovalKey(
      { ...request, detail: { ...(request.detail as object), cwd: '/other-game' } },
      'claude',
      '/game',
    ),
  ).not.toBe(key);
});

it.each<ApprovalRequest>([
  { ...request, scope: 'turn' },
  { ...request, kind: 'file-change' },
  { ...request, detail: { command: 'npm test' } },
  { ...request, detail: { tool_name: 'Write', input: { command: 'npm test' } } },
  { ...request, detail: { tool_name: 'Bash', input: { command: '' } } },
  { ...request, detail: { tool_name: 'Bash', input: [] } },
])('does not derive command rules from unsupported or malformed requests', (value) => {
  expect(commandApprovalKey(value, 'claude', '/game')).toBeUndefined();
});

it('does not interpret other vendors as Claude', () => {
  expect(commandApprovalKey(request, 'codex', '/game')).toBeUndefined();
  expect(commandApprovalKey(request, 'muse', '/game')).toBeUndefined();
});

it('shares rules only within the owning session and clears existing handles', () => {
  const session = {};
  const first = commandApprovalMemory(session);
  first.add('key');
  const second = commandApprovalMemory(session);
  expect(second.has('key')).toBe(true);
  expect(commandApprovalMemory({}).has('key')).toBe(false);
  clearCommandApprovals();
  expect(first.has('key')).toBe(false);
  expect(second.has('key')).toBe(false);
  second.add('new');
  expect(first.has('new')).toBe(true);
});
