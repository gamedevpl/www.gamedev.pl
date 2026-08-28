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
    jobId: 1_000_001,
    title: 'Comet Courier',
    slug: 'comet-courier',
    state: 'published',
    sessions: 2,
    credits: 2,
    gateRuns: 1,
    usd: 0.02,
    elapsedMs: 2 * HOUR,
    published: true,
    createdAt: '2026-07-30T10:00:00Z',
    ...overrides,
  };
}

function report(overrides: Partial<CostReport> = {}): CostReport {
  return {
    jobs: [job()],
    totals: { jobs: 1, sessions: 2, credits: 2, gateRuns: 1, published: 1, usd: 0.02 },
    creditsPerPublishedGame: 2,
    usdPerPublishedGame: 0.02,
    medianTimeToPublishMs: 2 * HOUR,
    creditsOnUnpublished: 0,
    usdOnUnpublished: 0,
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
    expect(headline?.textContent).toContain('Cost per published game');
    // Money leads, because that is the number worth quoting; credits stay beside it
    // because that is the unit a bill can be checked against.
    expect(headline?.querySelector('dd')?.textContent).toBe('$0.02');
    expect(headline?.textContent).toContain('2 credits');

    await act(async () => root.unmount());
  });

  it('shows what the failure rate costs, as a share of the whole', async () => {
    mocked.fetchCostReport.mockResolvedValue(
      report({
        jobs: [job(), job({ jobId: 1_000_002, published: false, state: 'failed', credits: 2, sessions: 2, usd: 0.02 })],
        totals: { jobs: 2, sessions: 4, credits: 4, gateRuns: 1, published: 1, usd: 0.04 },
        creditsPerPublishedGame: 4,
        usdPerPublishedGame: 0.04,
        creditsOnUnpublished: 2,
        usdOnUnpublished: 0.02,
      }),
    );

    const { container, root } = await render();

    expect(container.querySelector('.admin-cost-headline')?.textContent).toContain('$0.02');
    expect(container.querySelector('.admin-cost-headline')?.textContent).toContain('50% of the window');
    // The failed job keeps its row: the headline is only checkable if the rows are there.
    expect(container.querySelectorAll('.admin-cost-row.is-unpublished')).toHaveLength(1);

    await act(async () => root.unmount());
  });

  it('prices a job in money and still shows tokens as a dash', async () => {
    // The rate is fixed, so money is a measurement. Tokens are not measured at all.
    mocked.fetchCostReport.mockResolvedValue(report());

    const { container, root } = await render();

    const cells = Array.from(container.querySelectorAll('tbody td')).map((cell) => cell.textContent);
    expect(cells.slice(-2)).toEqual(['—', '$0.02']);

    await act(async () => root.unmount());
  });

  it('leaves money a dash on a job nothing was billed to, rather than showing it as free', async () => {
    mocked.fetchCostReport.mockResolvedValue(
      report({ jobs: [job({ sessions: 0, credits: 0, gateRuns: 0, usd: undefined })] }),
    );

    const { container, root } = await render();

    const cells = Array.from(container.querySelectorAll('tbody td')).map((cell) => cell.textContent);
    expect(cells.slice(-1)).toEqual(['—']);

    await act(async () => root.unmount());
  });

  it('dashes the window total when nothing in it was priced, rather than claiming $0.00', async () => {
    // The headline has to answer the same way the rows do; $0.00 would read as a
    // measurement that came back zero instead of one that was never taken.
    mocked.fetchCostReport.mockResolvedValue(
      report({
        jobs: [job({ sessions: 0, credits: 0, gateRuns: 1, usd: undefined })],
        totals: { jobs: 1, sessions: 0, credits: 0, gateRuns: 1, published: 1 },
        usdPerPublishedGame: null,
      }),
    );

    const { container, root } = await render();

    // The last group is the window total. "Spent on builds that never shipped" stays
    // $0.00 here on purpose — there are no unpublished jobs, so nothing wasted is a
    // measured zero rather than an unmeasured one.
    const groups = container.querySelectorAll('.admin-cost-headline > div');
    expect(groups[groups.length - 1].querySelector('dd')?.textContent).toBe('—');

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
        totals: { jobs: 1, sessions: 2, credits: 2, gateRuns: 0, published: 0, usd: 0.02 },
        creditsPerPublishedGame: null,
        usdPerPublishedGame: null,
        medianTimeToPublishMs: null,
        creditsOnUnpublished: 2,
        usdOnUnpublished: 0.02,
      }),
    );

    const { container, root } = await render();

    // The leading value of each group, not the smaller unit under it.
    const values = Array.from(container.querySelectorAll('.admin-cost-headline dd:first-of-type')).map(
      (dd) => dd.textContent,
    );
    expect(values[0]).toBe('—');
    expect(values[1]).toBe('—');
    expect(container.querySelector('.admin-cost-headline')?.textContent).toContain('nothing published yet');

    await act(async () => root.unmount());
  });
});
