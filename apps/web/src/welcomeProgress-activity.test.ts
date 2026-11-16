import { expect, it } from 'vitest';
import type { SubmissionStatus } from './submissionApi.js';
import { welcomeProgressMessage, welcomeStatusLabel } from './welcomeProgress.js';

const t = (key: string) => key;

it('shows current tool activity over an old opening report, but preserves newer reports', () => {
  const at = new Date().toISOString();
  const status: SubmissionStatus = {
    status: 'building',
    lastAgentPresence: { key: 'managed_editing_files', at },
    events: [{ id: '1', kind: 'step', text: 'Starting', createdAt: new Date(Date.now() - 60_000).toISOString() }],
  };
  expect(welcomeProgressMessage(status, t)).toBe('statusView.presence.managed_editing_files');
  status.events![0] = {
    id: '2',
    kind: 'step',
    text: 'Playable draft ready',
    createdAt: new Date(Date.now() + 1000).toISOString(),
  };
  expect(welcomeProgressMessage(status, t)).toBe('Playable draft ready');
  status.lastAgentPresence = { key: 'managed_idle', at };
  expect(welcomeStatusLabel(status, t)).toBe('statusView.presence.managed_idle');
});
