// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminAssessmentsPanel } from './AdminAssessmentsPanel.js';
import type { GameAssessment } from '../review/reviewApi.js';

const mocked = vi.hoisted(() => ({
  fetchAllAdminAssessments: vi.fn(),
  fetchReviewSweeps: vi.fn(),
  resolveAssessment: vi.fn(),
}));

vi.mock('../../assessmentExportApi.js', () => ({ fetchAllAdminAssessments: mocked.fetchAllAdminAssessments }));
vi.mock('./adminApi.js', () => ({
  fetchReviewSweeps: mocked.fetchReviewSweeps,
  createReviewSweep: vi.fn(),
  patchReviewSweep: vi.fn(),
}));
vi.mock('../review/reviewApi.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../review/reviewApi.js')>()),
  resolveAssessment: mocked.resolveAssessment,
}));

function row(overrides: Partial<GameAssessment> = {}): GameAssessment {
  return {
    id: 'sky-dodge:g:alice',
    slug: 'sky-dodge',
    title: 'Sky Dodge',
    source: 'catalog',
    creatorHandle: null,
    reviewerUid: 'g:alice',
    verdict: 'cut',
    note: 'Controls are broken.',
    noteOrigin: 'text',
    checklist: null,
    clientContext: null,
    gameVersion: null,
    resolution: null,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-20T10:00:00.000Z',
    ...overrides,
  };
}

function exportBody(rows: GameAssessment[]) {
  const resolved = rows.filter((r) => r.resolution).length;
  return {
    total: rows.length,
    resolved,
    open: rows.length - resolved,
    games: [
      {
        slug: 'sky-dodge',
        title: 'Sky Dodge',
        keep: 0,
        cut: rows.length,
        skip: 0,
        notes: rows.length,
        resolved,
        open: rows.length - resolved,
      },
    ],
    recent: rows,
  };
}

function renderPanel() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  return { host, root: createRoot(host) };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('AdminAssessmentsPanel resolutions', () => {
  it('drops the withdrawn rationale instead of re-offering it against the next verdict', async () => {
    const resolved = row({
      resolution: {
        status: 'wont_fix',
        comment: 'Pacing is the point of this one.',
        link: null,
        resolvedAt: '2026-08-21T09:00:00.000Z',
        resolvedBy: 'g:boss',
      },
    });
    mocked.fetchReviewSweeps.mockResolvedValue({ open: null, recent: [], reviewerCount: 1 });
    mocked.fetchAllAdminAssessments.mockResolvedValue(exportBody([resolved]));
    mocked.resolveAssessment.mockResolvedValue({ assessments: [], resolved: false, stale: [] });

    const { host, root } = renderPanel();
    await act(async () => {
      root.render(<AdminAssessmentsPanel />);
    });

    expect(host.textContent).toContain('Pacing is the point of this one.');

    // Next verdict lands before the old follow-up is cleared.
    const fresh = row({ verdict: 'keep', note: 'The new opening fixes it.', updatedAt: '2026-08-21T12:00:00.000Z' });
    mocked.fetchAllAdminAssessments.mockResolvedValue(exportBody([fresh]));

    const clear = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Clear');
    await act(async () => {
      clear!.click();
    });

    const edit = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Resolve');
    await act(async () => {
      edit!.click();
    });

    const comment = host.querySelector('textarea');
    expect(comment?.value).toBe('');
    expect(host.textContent).not.toContain('Pacing is the point of this one.');

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
