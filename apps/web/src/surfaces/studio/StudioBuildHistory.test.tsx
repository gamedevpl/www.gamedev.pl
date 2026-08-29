// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';

const { sealPreview } = vi.hoisted(() => ({ sealPreview: vi.fn(async () => ({ version: 'v3' })) }));
vi.mock('../../submissionApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../submissionApi.js')>('../../submissionApi.js');
  return { ...actual, sealPreview };
});

import { StudioBuildHistory } from './StudioBuildHistory.js';
import type { SubmissionStatus } from '../../submissionApi.js';

async function mount(status: SubmissionStatus, token?: string, onSealed?: () => void) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StudioBuildHistory status={status} token={token} onSealed={onSealed} />);
  });
  return {
    host,
    unmount: () => {
      root.unmount();
      host.remove();
    },
  };
}

const base: SubmissionStatus = { status: 'in_review' };

describe('StudioBuildHistory', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders nothing when there is no build history yet', async () => {
    const { host, unmount } = await mount(base);
    expect(host.querySelector('[data-testid="studio-build-history"]')).toBeNull();
    unmount();
  });

  it('lists recent builds newest first with their verdict', async () => {
    const { host, unmount } = await mount({
      ...base,
      recentBuilds: [
        { version: 'v2', createdAt: new Date().toISOString(), mode: 'publish', verdict: 'red' },
        { version: 'v1', createdAt: new Date(Date.now() - 60_000).toISOString(), mode: 'preview', verdict: 'green' },
      ],
    });
    const rows = host.querySelectorAll('.studio-build-history-row');
    expect(rows.length).toBe(2);
    expect(rows[0]?.className).toContain('is-red');
    expect(rows[0]?.textContent).toContain('Publish');
    expect(rows[0]?.textContent).toContain('Failed');
    expect(rows[1]?.className).toContain('is-green');
    expect(rows[1]?.textContent).toContain('Preview');
    expect(rows[1]?.textContent).toContain('Passed');
    unmount();
  });

  it('marks the strip live while the newest build is still pending', async () => {
    const { host, unmount } = await mount({
      status: 'building',
      recentBuilds: [{ version: 'v3', createdAt: new Date().toISOString(), mode: 'publish', verdict: 'pending' }],
    });
    expect(host.querySelector('.studio-build-history-live')?.className).toContain('is-live');
    expect(host.querySelector('.studio-build-history-dot')?.className).toContain('is-live');
    unmount();
  });

  it('shows the idle strip once nothing is running and the top build has a verdict', async () => {
    const { host, unmount } = await mount({
      status: 'published',
      recentBuilds: [{ version: 'v4', createdAt: new Date().toISOString(), mode: 'publish', verdict: 'green' }],
    });
    expect(host.querySelector('.studio-build-history-live')?.className).not.toContain('is-live');
    unmount();
  });

  it('reads in_review as idle — the gate already resolved, no work is running', async () => {
    const { host, unmount } = await mount({
      status: 'in_review',
      recentBuilds: [{ version: 'v6', createdAt: new Date().toISOString(), mode: 'publish', verdict: 'green' }],
    });
    expect(host.querySelector('.studio-build-history-live')?.className).not.toContain('is-live');
    unmount();
  });

  it('reads a stalled "building" round as idle, not actively checking', async () => {
    const { host, unmount } = await mount({
      status: 'building',
      stall: 'quiet',
      recentBuilds: [{ version: 'v7', createdAt: new Date().toISOString(), mode: 'publish', verdict: 'pending' }],
    });
    expect(host.querySelector('.studio-build-history-live')?.className).not.toContain('is-live');
    expect(host.querySelector('.studio-build-history-dot')?.className).not.toContain('is-live');
    unmount();
  });

  it('trusts gateProgress over a stall — the gate itself is running', async () => {
    const { host, unmount } = await mount({
      status: 'building',
      stall: 'gate_not_started',
      gateProgress: { lane: 'preview', stage: 'smoke', index: 1, total: 3, at: new Date().toISOString() },
      recentBuilds: [{ version: 'v8', createdAt: new Date().toISOString(), mode: 'publish', verdict: 'pending' }],
    });
    expect(host.querySelector('.studio-build-history-live')?.className).toContain('is-live');
    unmount();
  });

  it('names a stale-kit failure instead of a plain "Failed"', async () => {
    const { host, unmount } = await mount({
      ...base,
      recentBuilds: [
        { version: 'v5', createdAt: new Date().toISOString(), mode: 'preview', verdict: 'red', status: 'kit_outdated' },
      ],
    });
    expect(host.querySelector('.studio-build-history-verdict')?.textContent).toBe('Needs a kit refresh');
    unmount();
  });

  it('shows badge and toggles pagination when builds exceed limit', async () => {
    const builds = Array.from({ length: 8 }, (_, i) => ({
      version: `v${i + 1}`,
      createdAt: new Date().toISOString(),
      mode: 'preview' as const,
      verdict: 'green' as const,
    }));
    const { host, unmount } = await mount({
      ...base,
      recentBuilds: builds,
      totalBuildsCount: 15,
    });
    expect(host.querySelector('[data-testid="studio-build-history-count"]')?.textContent).toContain(
      'Showing 5 of 15 builds',
    );
    let rows = host.querySelectorAll('.studio-build-history-row');
    expect(rows.length).toBe(5);

    const toggleBtn = host.querySelector('.studio-build-history-toggle-all') as HTMLButtonElement;
    expect(toggleBtn?.textContent).toContain('Show older builds');

    await act(async () => {
      toggleBtn.click();
    });

    rows = host.querySelectorAll('.studio-build-history-row');
    expect(rows.length).toBe(8);
    expect(host.querySelector('.studio-build-history-toggle-all')?.textContent).toContain('Show fewer');
    unmount();
  });

  it('expands build details with changelog, authorship, and preview/revert buttons', async () => {
    const { host, unmount } = await mount({
      ...base,
      slug: 'my-game',
      recentBuilds: [
        {
          version: 'v10',
          createdAt: new Date().toISOString(),
          mode: 'publish',
          verdict: 'green',
          authorship: 'agent',
          summary: 'Added jump physics and double-jump mechanic',
          fileCount: 4,
        },
      ],
    });

    const summary = host.querySelector('.studio-build-history-summary') as HTMLElement;
    await act(async () => {
      summary.click();
    });

    const details = host.querySelector('[data-testid="build-details-v10"]');
    expect(details).not.toBeNull();
    expect(details?.textContent).toContain('Version v10');
    expect(details?.textContent).toContain('Built by AI Agent');
    expect(details?.textContent).toContain('4 source files');
    expect(details?.textContent).toContain('Added jump physics and double-jump mechanic');
    expect(details?.querySelector('.is-revert')).not.toBeNull();

    unmount();
  });

  it('offers to seal only the current round build, by jobId — not by row position', async () => {
    // A newer sibling round on the same slug can outrank the current one in the list
    // (contract note on RecentBuild.jobId). Sealing must still bind to the round
    // this token/status actually is, not to whichever row happens to be newest.
    const { host, unmount } = await mount(
      {
        ...base,
        slug: 'my-game',
        jobId: 1000058,
        canSeal: true,
        recentBuilds: [
          {
            version: 'v2',
            createdAt: new Date().toISOString(),
            mode: 'preview',
            verdict: 'green',
            jobId: 1000059,
          },
          {
            version: 'v1',
            createdAt: new Date(Date.now() - 60_000).toISOString(),
            mode: 'preview',
            verdict: 'green',
            jobId: 1000058,
          },
        ],
      },
      'tok',
    );

    // Only one row expands at a time — check the newest (a sibling round), then the
    // current round's own row, in turn.
    const summaries = host.querySelectorAll('.studio-build-history-summary');
    await act(async () => {
      (summaries[0] as HTMLElement).click();
    });
    expect(host.querySelector('[data-testid="build-details-v2"]')?.querySelector('.is-seal')).toBeNull();

    await act(async () => {
      (host.querySelectorAll('.studio-build-history-summary')[1] as HTMLElement).click();
    });
    expect(host.querySelector('[data-testid="build-details-v1"]')?.querySelector('.is-seal')).not.toBeNull();

    unmount();
  });

  it('refreshes status immediately on seal and stays disabled after, so a stale canSeal cannot double-send', async () => {
    sealPreview.mockClear();
    const onSealed = vi.fn();
    const { host, unmount } = await mount(
      {
        ...base,
        slug: 'my-game',
        jobId: 1000058,
        canSeal: true,
        recentBuilds: [
          {
            version: 'v1',
            createdAt: new Date().toISOString(),
            mode: 'preview',
            verdict: 'green',
            jobId: 1000058,
          },
        ],
      },
      'tok',
      onSealed,
    );
    const summary = host.querySelector('.studio-build-history-summary') as HTMLElement;
    await act(async () => {
      summary.click();
    });
    const button = host.querySelector('.is-seal') as HTMLButtonElement;
    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    expect(sealPreview).toHaveBeenCalledTimes(1);
    // The caller's own poll would otherwise leave `canSeal` stale for its whole interval.
    expect(onSealed).toHaveBeenCalledTimes(1);
    // Disabled past success, not just while the request is in flight — a second click
    // during that stale window must not fire a second (409-doomed) request.
    expect(button.disabled).toBe(true);

    await act(async () => {
      button.click();
    });
    expect(sealPreview).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('does not offer to seal when the record is not eligible', async () => {
    const { host, unmount } = await mount(
      {
        ...base,
        slug: 'my-game',
        recentBuilds: [{ version: 'v1', createdAt: new Date().toISOString(), mode: 'preview', verdict: 'green' }],
      },
      'tok',
    );
    const summary = host.querySelector('.studio-build-history-summary') as HTMLElement;
    await act(async () => {
      summary.click();
    });
    expect(host.querySelector('.is-seal')).toBeNull();
    unmount();
  });
});
