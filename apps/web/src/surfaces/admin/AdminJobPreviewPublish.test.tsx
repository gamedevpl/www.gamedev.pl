// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminJobPreviewPublish } from './AdminJobPreviewPublish.js';
import type { JobQueueEntry } from './adminJobsApi.js';

const mocked = vi.hoisted(() => ({
  publishJob: vi.fn(),
}));

vi.mock('./adminJobsApi.js', () => mocked);

function job(): JobQueueEntry {
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
    recentTransitions: [],
  };
}

function dialog(): HTMLElement | null {
  return document.querySelector('.admin-job-confirm');
}

function dialogButton(label: string): HTMLButtonElement {
  return Array.from(dialog()?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === label,
  ) as HTMLButtonElement;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('AdminJobPreviewPublish', () => {
  it('surfaces an editorial refusal in plain language and requires a reason to override', async () => {
    mocked.publishJob.mockResolvedValue({
      refused: 'editorial_pending',
      editorial: { reviewers: 0, keep: 0, cut: 0, skip: 0, weakOrBad: {} },
    });

    const onMessage = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await act(async () => {
      root.render(createElement(AdminJobPreviewPublish, { job: job(), onMessage, onPublished: vi.fn() }));
    });

    await act(async () => {
      host.querySelector('button')?.click();
    });
    await act(async () => {
      dialogButton('Publish').click();
      await Promise.resolve();
    });

    expect(onMessage).toHaveBeenCalledWith(expect.stringContaining('no reviewer has cleared this game yet'));
    expect(onMessage).toHaveBeenCalledWith(expect.stringContaining('0 reviewers'));
    expect(dialog()?.textContent).toMatch(/Publish with no reviewer keep/i);
    expect(dialogButton('Override and publish').disabled).toBe(true);
    expect(dialog()?.querySelector('textarea')).not.toBeNull();

    await act(async () => root.unmount());
  });
});
