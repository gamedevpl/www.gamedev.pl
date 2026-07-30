// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminJobsPanel } from './AdminJobsPanel.js';
import type { JobQueueEntry, JobQueueResponse } from './adminJobsApi.js';

const mocked = vi.hoisted(() => ({
  fetchJobQueue: vi.fn(),
  publishJob: vi.fn(),
  cancelJob: vi.fn(),
  retryJob: vi.fn(),
  fetchPublishedGames: vi.fn(),
  regateGame: vi.fn(),
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
  // The published shelf loads alongside the queue in every test; individual tests
  // override with real data when the shelf is what they are about.
  if (mocked.fetchPublishedGames.getMockImplementation() === undefined) {
    mocked.fetchPublishedGames.mockResolvedValue([]);
  }
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

  it('takes two clicks to cancel, because canceled has no undo', async () => {
    mocked.fetchJobQueue.mockResolvedValue(queue([job({ state: 'building' })]));
    mocked.cancelJob.mockResolvedValue({ ok: true, state: 'canceled', stopEnforced: false });

    const { container, root } = await render();
    const button = container.querySelector('.admin-job-cancel') as HTMLButtonElement;

    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    // Armed, not fired: the first click is the question, not the answer.
    expect(mocked.cancelJob).not.toHaveBeenCalled();
    expect(button.textContent).toContain('Sure?');

    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    expect(mocked.cancelJob).toHaveBeenCalledWith(1_000_001);
    // "Told to stop", not "stopped" — the backend has no kill switch and the panel
    // must not promise one.
    expect(container.querySelector('.admin-job-message')?.textContent).toContain('next report');

    await act(async () => root.unmount());
  });

  it('never offers cancel mid-publish', async () => {
    // The one non-terminal state the API refuses to cancel from; the console should not
    // invite the click it knows the answer to.
    mocked.fetchJobQueue.mockResolvedValue(queue([job({ state: 'publishing' })]));

    const { container, root } = await render();

    expect(container.querySelector('.admin-job-cancel')).toBeNull();

    await act(async () => root.unmount());
  });

  it('offers retry on dead rounds and stalled builds, not on every healthy one', async () => {
    mocked.fetchJobQueue.mockResolvedValue(
      queue([
        job({ issueNumber: 1, state: 'failed' }),
        job({ issueNumber: 2, state: 'needs_changes' }),
        job({ issueNumber: 3, state: 'building', stall: 'quiet' }),
        // Healthy and working: a retry button here is an invitation to spend a credit
        // on nothing.
        job({ issueNumber: 4, state: 'building' }),
        job({ issueNumber: 5, state: 'ready_for_review' }),
      ]),
    );

    const { container, root } = await render();

    const retryButtons = Array.from(container.querySelectorAll('button')).filter(
      (button) => button.textContent === 'Retry',
    );
    expect(retryButtons).toHaveLength(3);

    await act(async () => root.unmount());
  });

  it('retries in one click and says what it cost', async () => {
    mocked.fetchJobQueue.mockResolvedValue(queue([job({ state: 'failed' })]));
    mocked.retryJob.mockResolvedValue({ ok: true, state: 'building', creditsSpent: 1 });

    const { container, root } = await render();
    const button = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent === 'Retry',
    ) as HTMLButtonElement;

    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    expect(mocked.retryJob).toHaveBeenCalledWith(1_000_001);
    expect(container.querySelector('.admin-job-message')?.textContent).toContain('1 credit');

    await act(async () => root.unmount());
  });

  it('names the next step when a retry is refused', async () => {
    mocked.fetchJobQueue.mockResolvedValue(queue([job({ state: 'failed' })]));
    mocked.retryJob.mockResolvedValue({ refused: 'never_dispatched' });

    const { container, root } = await render();
    const button = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent === 'Retry',
    ) as HTMLButtonElement;

    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    expect(container.querySelector('.admin-job-message')?.textContent).toContain('cancel it instead');

    await act(async () => root.unmount());
  });

  it('shows the published shelf with its health, and re-gates in one click', async () => {
    mocked.fetchJobQueue.mockResolvedValue(queue([]));
    mocked.fetchPublishedGames.mockResolvedValue([
      {
        slug: 'comet-courier',
        state: 'published',
        currentVersion: 'v1',
        publishedAt: '2026-07-01T10:00:00Z',
        healthCheck: {
          version: 'v1',
          requestedAt: '2026-07-29T10:00:00Z',
          green: false,
          verdictAt: '2026-07-29T10:20:00Z',
        },
      },
      { slug: 'apex-sprint', state: 'published', currentVersion: 'v2', publishedAt: '2026-07-02T10:00:00Z' },
    ]);
    mocked.regateGame.mockResolvedValue({ ok: true, buildId: 'b1' });

    const { container, root } = await render();

    const shelf = container.querySelector('.admin-published');
    expect(shelf?.textContent).toContain('comet-courier');
    // A red verdict is loud, and says the creator already knows.
    expect(shelf?.textContent).toContain('FAILING');
    expect(shelf?.textContent).toContain('creator nudged');
    // A game never checked says so rather than implying an answer.
    expect(shelf?.textContent).toContain('never checked');

    const regate = Array.from(shelf?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'Re-gate',
    ) as HTMLButtonElement;
    await act(async () => {
      regate.click();
      await Promise.resolve();
    });
    expect(mocked.regateGame).toHaveBeenCalledWith('comet-courier');
    expect(shelf?.textContent).toContain('health check started');

    await act(async () => root.unmount());
  });

  it('hides the shelf entirely when nothing is published', async () => {
    mocked.fetchJobQueue.mockResolvedValue(queue([job()]));
    mocked.fetchPublishedGames.mockResolvedValue([]);

    const { container, root } = await render();

    expect(container.querySelector('.admin-published')).toBeNull();

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
