// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminJobsPanel } from './AdminJobsPanel.js';
import type { JobQueueEntry, JobQueueResponse } from './adminJobsApi.js';

const mocked = vi.hoisted(() => ({
  fetchJobQueue: vi.fn(),
  fetchJobPreview: vi.fn(),
  publishJob: vi.fn(),
  cancelJob: vi.fn(),
  retryJob: vi.fn(),
  fetchPublishedGames: vi.fn(),
  regateGame: vi.fn(),
  deleteGame: vi.fn(),
}));

vi.mock('./adminJobsApi.js', () => mocked);

function job(overrides: Partial<JobQueueEntry> = {}): JobQueueEntry {
  return {
    jobId: 1_000_001,
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

function confirmDialog(): HTMLElement | null {
  return document.querySelector('.admin-job-confirm');
}

function confirmDialogButton(label: string): HTMLButtonElement {
  return Array.from(confirmDialog()?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === label,
  ) as HTMLButtonElement;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('AdminJobsPanel confirmations', () => {
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

    expect(mocked.publishJob).not.toHaveBeenCalled();
    expect(confirmDialog()?.textContent).toContain('Publish Comet Courier?');
    expect(confirmDialog()?.textContent).toContain('comet-courier');

    await act(async () => {
      confirmDialogButton('Publish').click();
      await Promise.resolve();
    });

    expect(mocked.publishJob).toHaveBeenCalledWith(1_000_001);
    expect(container.querySelector('.admin-job-message')?.textContent).toContain('published comet-courier');
    expect(mocked.fetchJobQueue).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
  });

  it('does not publish when the confirmation is dismissed', async () => {
    mocked.fetchJobQueue.mockResolvedValue(queue([job()]));

    const { container, root } = await render();
    await act(async () => {
      (container.querySelector('.admin-job-publish') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    await act(async () => {
      confirmDialogButton('Back').click();
      await Promise.resolve();
    });

    expect(mocked.publishJob).not.toHaveBeenCalled();
    expect(confirmDialog()).toBeNull();

    await act(async () => root.unmount());
  });

  it('closes the confirmation on Escape without publishing', async () => {
    mocked.fetchJobQueue.mockResolvedValue(queue([job()]));

    const { container, root } = await render();
    await act(async () => {
      (container.querySelector('.admin-job-publish') as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect(confirmDialog()).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await Promise.resolve();
    });

    expect(mocked.publishJob).not.toHaveBeenCalled();
    expect(confirmDialog()).toBeNull();

    await act(async () => root.unmount());
  });

  it('names the next step when a publish is refused', async () => {
    mocked.fetchJobQueue.mockResolvedValue(queue([job()]));
    mocked.publishJob.mockResolvedValue({ refused: 'gate_red' });

    const { container, root } = await render();

    await act(async () => {
      (container.querySelector('.admin-job-publish') as HTMLButtonElement).click();
      await Promise.resolve();
    });
    await act(async () => {
      confirmDialogButton('Publish').click();
      await Promise.resolve();
    });

    expect(container.querySelector('.admin-job-message')?.textContent).toContain('gate failed');

    await act(async () => root.unmount());
  });

  it('takes a confirmation dialog to cancel, because canceled has no undo', async () => {
    mocked.fetchJobQueue.mockResolvedValue(queue([job({ state: 'building' })]));
    mocked.cancelJob.mockResolvedValue({ ok: true, state: 'canceled', stopEnforced: false });

    const { container, root } = await render();

    const inFlightChip = Array.from(container.querySelectorAll('.admin-filter-chip')).find((c) =>
      c.textContent?.includes('In flight'),
    ) as HTMLButtonElement;
    await act(async () => {
      inFlightChip.click();
      await Promise.resolve();
    });

    const button = container.querySelector('.admin-job-cancel') as HTMLButtonElement;
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    expect(mocked.cancelJob).not.toHaveBeenCalled();
    expect(confirmDialog()?.textContent).toContain('Cancel Comet Courier?');
    expect(confirmDialog()?.textContent).toContain('cannot be undone');

    await act(async () => {
      confirmDialogButton('Cancel build').click();
      await Promise.resolve();
    });
    expect(mocked.cancelJob).toHaveBeenCalledWith(1_000_001);
    expect(container.querySelector('.admin-job-message')?.textContent).toContain('next report');

    await act(async () => root.unmount());
  });

  it('does not cancel when the confirmation is dismissed', async () => {
    mocked.fetchJobQueue.mockResolvedValue(queue([job({ state: 'building' })]));

    const { container, root } = await render();
    const inFlightChip = Array.from(container.querySelectorAll('.admin-filter-chip')).find((c) =>
      c.textContent?.includes('In flight'),
    ) as HTMLButtonElement;
    await act(async () => {
      inFlightChip.click();
      await Promise.resolve();
    });

    await act(async () => {
      (container.querySelector('.admin-job-cancel') as HTMLButtonElement).click();
      await Promise.resolve();
    });
    await act(async () => {
      confirmDialogButton('Keep').click();
      await Promise.resolve();
    });

    expect(mocked.cancelJob).not.toHaveBeenCalled();
    expect(confirmDialog()).toBeNull();

    await act(async () => root.unmount());
  });

  it('confirms publish from the preview theater before going live', async () => {
    mocked.fetchJobQueue.mockResolvedValue(queue([job({ jobId: 1234, title: 'Sky Dodge', slug: 'sky-dodge' })]));
    mocked.fetchJobPreview.mockResolvedValue({
      slug: 'sky-dodge',
      title: 'Sky Dodge',
      version: 'v1',
      html: '<!doctype html><html><body>Playable Game Canvas</body></html>',
    });
    mocked.publishJob.mockResolvedValue({
      ok: true,
      slug: 'sky-dodge',
      version: 'v1',
      publishedAt: '2026-07-30T12:00:00Z',
    });

    const { container, root } = await render();
    await act(async () => {
      (container.querySelector('.admin-job-preview-btn') as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const publishBtn = Array.from(document.querySelectorAll('.admin-preview-actions button')).find(
      (button) => button.textContent === 'Publish Game',
    ) as HTMLButtonElement;
    await act(async () => {
      publishBtn.click();
      await Promise.resolve();
    });

    expect(mocked.publishJob).not.toHaveBeenCalled();
    expect(confirmDialog()?.textContent).toContain('Publish Sky Dodge?');
    expect(document.querySelector('.admin-preview-modal')).not.toBeNull();

    await act(async () => {
      confirmDialogButton('Publish').click();
      await Promise.resolve();
    });
    expect(mocked.publishJob).toHaveBeenCalledWith(1234);

    await act(async () => root.unmount());
  });

  it('executes batch publish on deduplicated ready jobs', async () => {
    mocked.fetchJobQueue.mockResolvedValue(
      queue([
        job({ jobId: 10, slug: 'game-1', state: 'ready_for_review' }),
        job({ jobId: 9, slug: 'game-1', state: 'ready_for_review' }),
        job({ jobId: 11, slug: 'game-2', state: 'ready_for_review' }),
        job({ jobId: 12, slug: 'game-3', state: 'building' }),
      ]),
    );
    mocked.publishJob.mockResolvedValue({ ok: true, slug: 'game', version: 'v1', publishedAt: '2026-07-30T12:00:00Z' });

    const { container, root } = await render();
    const bulkBtn = container.querySelector('.admin-bulk-publish-cta') as HTMLButtonElement;
    expect(bulkBtn?.textContent).toContain('Publish all ready (2)');

    await act(async () => {
      bulkBtn.click();
      await Promise.resolve();
    });

    expect(mocked.publishJob).not.toHaveBeenCalled();
    expect(confirmDialog()?.textContent).toContain('Publish 2 games?');

    await act(async () => {
      confirmDialogButton('Publish 2').click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocked.publishJob).toHaveBeenCalledWith(10);
    expect(mocked.publishJob).toHaveBeenCalledWith(11);
    expect(mocked.publishJob).not.toHaveBeenCalledWith(9);
    expect(mocked.publishJob).not.toHaveBeenCalledWith(12);

    await act(async () => root.unmount());
  });
});
