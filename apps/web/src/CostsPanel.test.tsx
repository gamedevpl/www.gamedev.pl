// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CostsPanel } from './CostsPanel.js';
import type { CostReport, JobCostSummary } from './adminApi.js';

const mocked = vi.hoisted(() => ({
  fetchAdminSummary: vi.fn(),
  fetchCostReport: vi.fn(),
  fetchCreationLimits: vi.fn(),
  setCreationLimits: vi.fn(),
  fetchSuggestions: vi.fn(),
  fetchAccessTokens: vi.fn(),
  mintAccessToken: vi.fn(),
  revokeAccessToken: vi.fn(),
}));

vi.mock('./adminApi.js', () => mocked);

const HOUR = 60 * 60_000;

function job(overrides: Partial<JobCostSummary> = {}): JobCostSummary {
  return {
    issueNumber: 1_000_001,
    title: 'Comet Courier',
    slug: 'comet-courier',
    state: 'published',
    sessions: 2,
    credits: 2,
    gateRuns: 1,
    elapsedMs: 2 * HOUR,
    published: true,
    createdAt: '2026-07-30T10:00:00Z',
    ...overrides,
  };
}

function report(overrides: Partial<CostReport> = {}): CostReport {
  return {
    jobs: [job()],
    totals: { jobs: 1, sessions: 2, credits: 2, gateRuns: 1, published: 1 },
    creditsPerPublishedGame: 2,
    medianTimeToPublishMs: 2 * HOUR,
    creditsOnUnpublished: 0,
    unmeasuredJobs: 0,
    ...overrides,
  };
}

async function render() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(CostsPanel));
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('CostsPanel', () => {
  it('leads with what a published game costs', async () => {
    mocked.fetchCostReport.mockResolvedValue(report());

    const { container, root } = await render();

    const headline = container.querySelector('.admin-cost-headline');
    expect(headline?.textContent).toContain('Credits per published game');
    expect(headline?.querySelector('dd')?.textContent).toBe('2');

    await act(async () => root.unmount());
  });

  it('shows what the failure rate costs, as a share of the whole', async () => {
    mocked.fetchCostReport.mockResolvedValue(
      report({
        jobs: [job(), job({ issueNumber: 1_000_002, published: false, state: 'failed', credits: 2, sessions: 2 })],
        totals: { jobs: 2, sessions: 4, credits: 4, gateRuns: 1, published: 1 },
        creditsPerPublishedGame: 4,
        creditsOnUnpublished: 2,
      }),
    );

    const { container, root } = await render();

    expect(container.querySelector('.admin-cost-headline')?.textContent).toContain('2 (50%)');
    // The failed job keeps its row: the headline is only checkable if the rows are there.
    expect(container.querySelectorAll('.admin-cost-row.is-unpublished')).toHaveLength(1);

    await act(async () => root.unmount());
  });

  it('renders unmeasured money and tokens as dashes, never as zero', async () => {
    mocked.fetchCostReport.mockResolvedValue(report());

    const { container, root } = await render();

    const cells = Array.from(container.querySelectorAll('tbody td')).map((cell) => cell.textContent);
    expect(cells.slice(-2)).toEqual(['—', '—']);
    expect(container.textContent).not.toContain('$0.00');

    await act(async () => root.unmount());
  });

  it('says the totals are a floor when jobs predate the ledger', async () => {
    mocked.fetchCostReport.mockResolvedValue(report({ unmeasuredJobs: 3 }));

    const { container, root } = await render();

    expect(container.querySelector('.health-note')?.textContent).toContain('a floor, not a total');

    await act(async () => root.unmount());
  });

  it('has no cost-per-game to show before anything published', async () => {
    mocked.fetchCostReport.mockResolvedValue(
      report({
        jobs: [job({ published: false, state: 'building' })],
        totals: { jobs: 1, sessions: 2, credits: 2, gateRuns: 0, published: 0 },
        creditsPerPublishedGame: null,
        medianTimeToPublishMs: null,
        creditsOnUnpublished: 2,
      }),
    );

    const { container, root } = await render();

    const values = Array.from(container.querySelectorAll('.admin-cost-headline dd')).map((dd) => dd.textContent);
    expect(values[0]).toBe('—');
    expect(values[1]).toBe('—');

    await act(async () => root.unmount());
  });
});
