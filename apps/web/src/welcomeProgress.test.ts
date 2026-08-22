import { describe, expect, it } from 'vitest';
import type { SubmissionStatus } from './submissionApi.js';
import { welcomeProgressMessage, welcomeStatusLabel } from './welcomeProgress.js';

const t = (key: string) => key;

describe('welcomeProgressMessage', () => {
  it('prefers the latest agent event text', () => {
    const status = {
      status: 'building',
      events: [
        { id: '1', kind: 'step', text: ' Older note ', createdAt: '2026-08-07T00:00:00Z' },
        { id: '2', kind: 'step', text: ' Laying out the bastion ', createdAt: '2026-08-07T00:05:00Z' },
      ],
    } as SubmissionStatus;
    expect(welcomeProgressMessage(status, t)).toBe('Laying out the bastion');
  });

  it('falls back through note, presence, phase, then state copy', () => {
    expect(welcomeProgressMessage(null, t)).toBe('welcome.loading');
    expect(
      welcomeProgressMessage(
        {
          status: 'queued',
          progress: { headSha: 'abc', commits: [], checklist: [], note: 'Seeding draft', revisions: [] },
        },
        t,
      ),
    ).toBe('Seeding draft');
    expect(welcomeProgressMessage({ status: 'queued', phase: 'dispatched' }, t)).toBe('statusView.phases.dispatched');
    expect(welcomeProgressMessage({ status: 'queued' }, t)).toBe('statusView.states.queued.description');
  });
});

describe('welcomeStatusLabel', () => {
  it('uses the phase label when the agent is starting', () => {
    expect(welcomeStatusLabel({ status: 'queued', phase: 'dispatched' }, t)).toBe('statusView.phaseLabels.dispatched');
    expect(welcomeStatusLabel({ status: 'building' }, t)).toBe('statusView.states.building.label');
  });
});
