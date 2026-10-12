// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { fetchGameBuilds } from '../../studioApi.js';
import type { RecentBuild, SubmissionStatus } from '../../submissionApi.js';
import { StudioBuildHistory } from './StudioBuildHistory.js';
import { mergeBuildHistory } from './studioBuildHistoryModel.js';

vi.mock('../../studioApi.js', async () => ({
  ...(await vi.importActual<typeof import('../../studioApi.js')>('../../studioApi.js')),
  fetchGameBuilds: vi.fn(),
}));

function build(version: string, createdAt: string, verdict: RecentBuild['verdict'] = 'green'): RecentBuild {
  return { version, createdAt, mode: 'preview', verdict, jobId: 7 };
}
const old = build('v1', '2026-10-12T10:00:00.000Z');
const newest = build('v2', '2026-10-12T11:00:00.000Z');

describe('build history snapshots', () => {
  it('preserves a terminal fetched verdict beside a stale pending status and keeps newer status metadata', () => {
    expect(mergeBuildHistory([{ ...old, verdict: 'pending' }], [old])[0]?.verdict).toBe('green');
    expect(mergeBuildHistory([{ ...old, summary: 'Updated' }], [old])[0]?.summary).toBe('Updated');
  });

  it('orders equal timestamps by the stored version ordering', () => {
    const first = { ...old, version: 'v20261012T100000000Z-0001' };
    const second = { ...old, version: 'v20261012T100000000Z-0002' };
    expect(mergeBuildHistory([first], [second]).map((item) => item.version)).toEqual([second.version, first.version]);
  });

  it('keeps a build arriving during the older-builds fetch first and disables reverting that head', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    let resolveFetch!: (result: Awaited<ReturnType<typeof fetchGameBuilds>>) => void;
    vi.mocked(fetchGameBuilds).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const status: SubmissionStatus = {
      status: 'needs_changes',
      jobId: 7,
      slug: 'retry-game',
      recentBuilds: [old],
      totalBuildsCount: 8,
    };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(<StudioBuildHistory status={status} />);
      });
      await act(async () => {
        host.querySelector<HTMLButtonElement>('.studio-build-history-toggle-all')!.click();
      });
      await act(async () => {
        resolveFetch({ builds: [newest, old], totalCount: 8 });
      });
      const rows = host.querySelectorAll('.studio-build-history-row');
      await act(async () => {
        rows[0]!.querySelector<HTMLElement>('.studio-build-history-summary')!.click();
      });
      expect(rows[0]!.querySelector('.studio-build-history-version-tag')?.textContent).toContain('v2');
      expect(rows[0]!.querySelector<HTMLButtonElement>('.is-revert')?.disabled).toBe(true);
      await act(async () => {
        rows[1]!.querySelector<HTMLElement>('.studio-build-history-summary')!.click();
      });
      expect(rows[1]!.querySelector('.studio-build-history-version-tag')?.textContent).toContain('v1');
      expect(rows[1]!.querySelector<HTMLButtonElement>('.is-revert')?.disabled).toBe(false);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
      vi.resetAllMocks();
    }
  });
});
