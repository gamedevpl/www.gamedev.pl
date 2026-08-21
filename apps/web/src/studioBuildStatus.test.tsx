// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from './i18n/index.js';
import { StudioBuildHistory } from './StudioBuildHistory.js';
import { StudioStageCard } from './StudioStageCard.js';
import type { SubmissionStatus } from './submissionApi.js';

const hosts: Array<() => void> = [];

async function render(node: React.ReactElement) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(node);
  });
  hosts.push(() => {
    root.unmount();
    host.remove();
  });
  return host;
}

afterEach(() => {
  while (hosts.length) hosts.pop()!();
});

// A BYOCA agent calling `end` does not stop our gate.
const ENDED_BUT_GATING = {
  status: 'building',
  phase: 'submitted',
  stall: 'ended',
  agentEndedAt: '2026-08-21T17:40:00.000Z',
  recentBuilds: [
    { version: 'v9', createdAt: '2026-08-21T17:40:00.000Z', mode: 'publish', verdict: 'pending', total: 12 },
  ],
} as unknown as SubmissionStatus;

describe('Studio status while the gate still owes a verdict', () => {
  it('does not report the build rail as idle beside a pending row', async () => {
    // It used to contradict its own first line.
    const host = await render(<StudioBuildHistory status={ENDED_BUT_GATING} />);

    expect(host.querySelector('.studio-build-history-live')?.className).toContain('is-live');
  });

  it('does not tell the creator the round produced nothing', async () => {
    // That copy asked for a new round, which would burn one.
    const host = await render(<StudioStageCard status={ENDED_BUT_GATING} />);
    const text = host.textContent ?? '';

    expect(text).not.toContain('no playable version');
    expect(text).not.toContain('finished this round');
  });
});

// The window between delivery and the gate's first stage report.
describe('the stage card before the gate reports a stage', () => {
  const justDelivered = {
    status: 'building',
    phase: 'submitted',
    events: [
      { id: 'e1', text: 'Graphics pass: lit cities that dim when struck', createdAt: '2026-08-21T17:40:00.000Z' },
    ],
    recentBuilds: [
      { version: 'v9', createdAt: '2026-08-21T17:40:00.000Z', mode: 'publish', verdict: 'pending', total: 12 },
    ],
  } as unknown as SubmissionStatus;

  it('says it is checking, not that the agent is still writing', async () => {
    const host = await render(<StudioStageCard status={justDelivered} />);
    const text = host.textContent ?? '';

    expect(text).toContain('Checking the build.');
    expect(text).not.toContain('Graphics pass');
  });
});
