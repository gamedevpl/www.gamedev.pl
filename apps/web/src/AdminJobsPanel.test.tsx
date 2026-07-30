// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminJobsPanel } from './AdminJobsPanel.js';
import type { JobQueueEntry, JobQueueResponse } from './adminJobsApi.js';

const mocked = vi.hoisted(() => ({
  fetchJobQueue: vi.fn(),
  publishJob: vi.fn(),
}));

vi.mock('./adminJobsApi.js', () => mocked);

function job(overrides: Partial<JobQueueEntry> = {}): JobQueueEntry {
  return {
    issueNumber: 1_000_001,
    title: 'Comet Courier',
    ownerUid: 'g:1',
    slug: 'comet-courier',
    state: 'ready_for_review',
    creatorStatus: 'in_review',
    ageMs: 90 * 60_000,
    timeInStateMs: 5 * 60_000,
    stall: null,
    recentTransitions: [{ to: 'ready_for_review', at: '2026-07-30T12:00:00Z', by: 'gate', reason: 'gate_green' }],
    ...overrides,
  };
}

function queue(jobs: JobQueueEntry[]): JobQueueResponse {
  return { jobs, byState: {}, stalled: jobs.filter((entry) => entry.stall).length };
}

async function render() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(AdminJobsPanel));
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('AdminJobsPanel', () => {
  it('offers publish only for a build the gate has passed', async () => {
    // Any earlier state means the API would refuse, and a button that invites a click
    // whose answer is already known is worse than no button.
    mocked.fetchJobQueue.mockResolvedValue(
      queue([job({ issueNumber: 1, state: 'building' }), job({ issueNumber: 2, state: 'ready_for_review' })]),
    );

    const { container, root } = await render();

    expect(container.querySelectorAll('.admin-job-publish')).toHaveLength(1);

    await act(async () => root.unmount());
  });

  it('publishes and says which game went live', async () => {
    mocked.fetchJobQueue.mockResolvedValue(queue([job()]));
    mocked.publishJob.mockResolvedValue({
      ok: true,
      slug: 'comet-courier',
      version: 'v1',
      publishedAt: '2026-07-30T12:00:00Z',
    });

    const { container, root } = await render();
    const button = container.querySelector('.admin-job-publish') as HTMLButtonElement;

    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    expect(mocked.publishJob).toHaveBeenCalledWith(1_000_001);
    expect(container.querySelector('.admin-job-message')?.textContent).toContain('published comet-courier');
    // Re-read after publishing: the row has left the queue and the view should say so
    // rather than keep showing a job that is no longer active.
    expect(mocked.fetchJobQueue).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
  });

  it('names the next step when a publish is refused', async () => {
    // "Could not publish" collapses three different next steps into one shrug.
    mocked.fetchJobQueue.mockResolvedValue(queue([job()]));
    mocked.publishJob.mockResolvedValue({ refused: 'gate_red' });

    const { container, root } = await render();

    await act(async () => {
      (container.querySelector('.admin-job-publish') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(container.querySelector('.admin-job-message')?.textContent).toContain('gate failed');

    await act(async () => root.unmount());
  });

  it('says why a job looks stuck instead of leaving silence to say it', async () => {
    mocked.fetchJobQueue.mockResolvedValue(queue([job({ state: 'building', stall: 'quiet' })]));

    const { container, root } = await render();

    expect(container.querySelector('.admin-job-stall')?.textContent).toContain('silent');
    expect(container.querySelector('.admin-job-row')?.className).toContain('is-stalled');

    await act(async () => root.unmount());
  });

  it('renders nothing but "not found" for a non-admin', async () => {
    // Same answer the API gives: the operator surface does not confirm it exists.
    mocked.fetchJobQueue.mockResolvedValue(null);

    const { container, root } = await render();

    expect(container.textContent).toContain('Not found');
    expect(container.querySelector('.admin-jobs-table')).toBeNull();

    await act(async () => root.unmount());
  });
});
