// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { GamePerformanceResponse } from '@gamedevpl/contract';
import { StudioPerformance } from './StudioPerformance.js';
import * as api from '../../gamePerformanceApi.js';
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => key + (values ? ' ' + JSON.stringify(values) : ''),
  }),
}));
const report: GamePerformanceResponse = {
  slug: 'space-hop',
  requestedDays: 7,
  days: ['2026-10-04'],
  performanceReviewers: 'include',
  artifactVersion: null,
  availableVersions: ['a'.repeat(64)],
  versionsTruncated: false,
  measuredAt: '2026-10-04T10:00:00Z',
  freshUntil: '2026-10-04T10:10:00Z',
  status: 'no_traffic',
  scanTruncated: false,
  groupsTruncated: false,
  totalGroups: 0,
  measuredSessions: 0,
  unmeasuredSessions: 0,
  invalidWindows: 0,
  agentEventsExcluded: 0,
  aliveWithoutPerformance: 0,
  groups: [],
};
const mounted: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of mounted.splice(0)) await cleanup();
  vi.restoreAllMocks();
});
async function mount() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  await act(async () => root.render(<StudioPerformance slug="space-hop" days={7} />));
  return { container, root };
}
it('queries selected cohorts/builds and hides stale measurements while loading or failing', async () => {
  const read = vi.spyOn(api, 'fetchGamePerformance').mockResolvedValue(report);
  const { container } = await mount();
  expect(read).toHaveBeenLastCalledWith({ slug: 'space-hop', days: 7, performanceReviewers: 'include' });
  expect(container.textContent).toContain('studioPerformance.noTraffic');
  const selects = container.querySelectorAll('select');
  await act(async () => {
    selects[1]!.value = 'a'.repeat(64);
    selects[1]!.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(read).toHaveBeenLastCalledWith({
    slug: 'space-hop',
    days: 7,
    performanceReviewers: 'include',
    artifactVersion: 'a'.repeat(64),
  });
  let reject!: (error: Error) => void;
  read.mockReturnValue(
    new Promise((_resolve, r) => {
      reject = r;
    }),
  );
  await act(async () => {
    selects[0]!.value = 'only';
    selects[0]!.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(container.textContent).toContain('studioPerformance.loading');
  expect(container.textContent).not.toContain('studioPerformance.coverage');
  await act(async () => reject(new Error('429')));
  expect(container.textContent).toContain('studioPerformance.rateLimited');
  expect(container.textContent).not.toContain('studioPerformance.coverage');
  read.mockResolvedValue({ ...report, status: 'no_valid_windows', scanTruncated: true });
  await act(async () => container.querySelector('button')!.click());
  expect(container.textContent).toContain('studioPerformance.noValidWindows');
  expect(container.textContent).toContain('studioPerformance.truncated');
});
it('ignores an old request after the selected day window changes', async () => {
  let resolve!: (report: GamePerformanceResponse) => void;
  const read = vi.spyOn(api, 'fetchGamePerformance').mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const { container, root } = await mount();
  read.mockResolvedValue({ ...report, measuredSessions: 9 });
  await act(async () => root.render(<StudioPerformance slug="space-hop" days={1} />));
  await act(async () => resolve({ ...report, measuredSessions: 999 }));
  expect(container.textContent).toContain('"measured":9');
  expect(container.textContent).not.toContain('999');
});
