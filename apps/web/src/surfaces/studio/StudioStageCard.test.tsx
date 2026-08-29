// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n/index.js';
import { StudioStageCard } from './StudioStageCard.js';
import type { SubmissionStatus } from '../../submissionApi.js';

async function mount(status?: SubmissionStatus | null) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StudioStageCard status={status} />);
  });
  return {
    host,
    unmount: () => {
      root.unmount();
      host.remove();
    },
  };
}

const building: SubmissionStatus = { status: 'building' };

describe('StudioStageCard', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('falls back to the thread hint when the status carries nothing yet', async () => {
    const { host, unmount } = await mount(building);
    expect(host.querySelector('.studio-stage-card-title')?.textContent).toBe('The build is coming together.');
    expect(host.querySelector('.studio-stage-card-detail')?.textContent).toContain("hasn't landed a playable");
    expect(host.querySelector('.studio-stage-card-working')).toBeNull();
    unmount();
  });

  it("shows the agent's latest line, its checklist count and its heartbeat", async () => {
    const at = new Date(Date.now() - 60_000).toISOString();
    const { host, unmount } = await mount({
      ...building,
      events: [
        { id: '1', kind: 'step', step: 'fixing', text: 'Fixing GameKit input configuration.', createdAt: at },
        { id: '0', kind: 'step', text: 'Started.', progress: { done: 3, total: 8 }, createdAt: at },
      ],
    });
    expect(host.querySelector('.studio-stage-card-kicker')?.textContent).toBe('Fixing');
    expect(host.querySelector('.studio-stage-card-working-text')?.textContent).toBe(
      'Fixing GameKit input configuration.',
    );
    expect(host.querySelector('.studio-stage-card-count')?.textContent).toBe('3 of 8 done');
    expect(host.querySelector('.build-progress-bar')?.getAttribute('aria-valuenow')).toBe('3');
    expect(host.querySelector('.studio-stage-card-heartbeat')?.textContent).toContain('updated');
    expect(host.querySelector('.studio-stage-card-detail')).toBeNull();
    unmount();
  });

  it('names the running check once the round is delivered and the gate takes over', async () => {
    const { host, unmount } = await mount({
      ...building,
      agentEndedAt: new Date().toISOString(),
      stall: 'ended',
      events: [
        { id: '1', kind: 'done', text: 'Delivered.', createdAt: new Date(Date.now() - 20 * 60_000).toISOString() },
      ],
      gateProgress: { lane: 'preview', stage: 'smoke', index: 2, total: 5, at: new Date().toISOString() },
    });
    expect(host.querySelector('.studio-stage-card-title')?.textContent).toBe('Checking the build.');
    expect(host.querySelector('.studio-stage-card-working-text')?.textContent).toBe('Running smoke test…');
    expect(host.querySelector('.studio-stage-card-detail')).toBeNull();
    // Gate's own timestamp, not the stale pre-delivery event.
    expect(host.querySelector('.studio-stage-card-heartbeat')?.textContent).toContain('now');
    expect(host.querySelector('.studio-stage-card-heartbeat')?.textContent).not.toContain('minutes ago');
    unmount();
  });

  it('says the round ended, and why the stage is still empty, when the agent stops', async () => {
    const { host, unmount } = await mount({
      ...building,
      stall: 'ended',
      agentEndedAt: new Date().toISOString(),
    });
    expect(host.querySelector('.studio-stage-card-title')?.textContent).toBe('The agent finished this round.');
    expect(host.querySelector('.studio-stage-card-detail')?.textContent).toContain('No playable build landed');
    unmount();
  });

  it('renders the thread copy for a stall value it has no stage wording for', async () => {
    const { host, unmount } = await mount({ ...building, stall: 'gate_not_started' });
    expect(host.querySelector('.studio-stage-card-detail')?.textContent).toContain("verification hasn't started");
    unmount();
  });
});
