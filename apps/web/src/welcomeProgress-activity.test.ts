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

it('does not claim the agent is still joining five minutes after its only signal', () => {
  const at = new Date(Date.now() - 300_000).toISOString();
  const status: SubmissionStatus = {
    status: 'building',
    phase: 'building',
    lastAgentSignalAt: at,
    lastAgentPresence: { key: 'joining_round', at },
  };
  expect(welcomeProgressMessage(status, t)).toBe('welcome.agentStarted');
});

it('keeps a fresh checkpoint over a later coarse pulse, then allows a supported summary', () => {
  const at = new Date(Date.now() + 4000).toISOString();
  const status: SubmissionStatus = {
    status: 'building',
    phase: 'building',
    lastAgentSignalAt: at,
    lastAgentPresence: { key: 'managed_editing_files', at },
    events: [
      { id: '1', kind: 'step', text: 'The controls work.', createdAt: new Date(Date.now() - 2000).toISOString() },
    ],
  };
  expect(welcomeStatusLabel(status, t)).toBe('statusView.states.building.label');
  expect(welcomeProgressMessage(status, t)).toBe('The controls work.');
  status.lastAgentPresence = { ...status.lastAgentPresence!, text: 'Edited the map.', textAt: at };
  expect(welcomeProgressMessage(status, t)).toBe('The controls work.');
  status.events![0].createdAt = new Date(Date.now() - 31_000).toISOString();
  expect(welcomeProgressMessage(status, t)).toBe('Edited the map.');
  status.events![0].text = 'The bridge is ready.';
  status.events![0].createdAt = new Date().toISOString();
  expect(welcomeProgressMessage(status, t)).toBe('The bridge is ready.');
});
