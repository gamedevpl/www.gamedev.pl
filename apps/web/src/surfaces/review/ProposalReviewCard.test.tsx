// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProposalReviewCard } from './ProposalReviewCard.js';
import type { Proposal } from '../../proposalsApi.js';

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function proposal(overrides?: Partial<Proposal>): Proposal {
  return {
    id: 'p1',
    targetSlug: 'neon-drift',
    proposerUid: 'g:tomek',
    state: 'in_review',
    title: 'Tighter drift',
    description: 'Corners feel floaty at speed.',
    base: { kind: 'store', version: 'base-1' },
    version: 'v2',
    createdAt: '2026-08-04T10:00:00Z',
    updatedAt: '2026-08-04T10:00:00Z',
    gate: { green: true, ranAt: '2026-08-04T10:05:00Z' },
    thread: [],
    platformOwned: false,
    ...overrides,
  };
}

async function mount(node: ReturnType<typeof createElement>) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(node);
    await flush();
  });
  return host;
}

function buttonWith(host: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find((button) => button.textContent?.includes(text)) as
    HTMLButtonElement | undefined;
}

async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.click();
    await flush();
  });
}

describe('ProposalReviewCard', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('says on the card that accepting publishes nothing', async () => {
    // The single most important sentence on this surface. A creator who reads "Accept" as
    // "put this on my game right now" will either never press it or press it and feel
    // ambushed, and both are worse than the feature not existing.
    const host = await mount(createElement(ProposalReviewCard, { proposal: proposal(), onChanged: () => {} }));
    expect(host.querySelector('.propose-note')?.textContent).toBeTruthy();
  });

  it('shows the gate verdict and the behavioural-diff finding', async () => {
    const host = await mount(
      createElement(ProposalReviewCard, { proposal: proposal({ behaviouralDiff: true }), onChanged: () => {} }),
    );
    // Two chips: checks passed, and the finding. A behavioural diff is never an automatic
    // refusal — a proposal that changes behaviour is supposed to change the golden.
    expect(host.querySelectorAll('.proposal-chip').length).toBe(2);
    expect(host.querySelector('.proposal-chip.is-warn')).toBeTruthy();
  });

  it('accepts through the API and reports the updated proposal', async () => {
    const accepted = proposal({ state: 'accepted' });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ proposal: accepted }) });
    vi.stubGlobal('fetch', fetchMock);
    const onChanged = vi.fn();
    const host = await mount(createElement(ProposalReviewCard, { proposal: proposal(), onChanged }));

    const accept = buttonWith(host, 'accept');
    expect(accept).toBeTruthy();
    await click(accept!);

    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/proposals/p1/accept');
    expect(onChanged).toHaveBeenCalledWith(accepted);
  });

  it('opens a form before declining rather than declining on the first click', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ proposal: proposal() }) });
    vi.stubGlobal('fetch', fetchMock);
    const host = await mount(createElement(ProposalReviewCard, { proposal: proposal(), onChanged: () => {} }));

    await click(buttonWith(host, 'decline')!);
    // A decline is somebody's work being turned down, and it should cost a second gesture
    // plus a reason — which is also what the statement-of-reasons rule needs.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(host.querySelector('select')).toBeTruthy();
  });

  it('surfaces a failure instead of silently doing nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({}) }));
    const host = await mount(createElement(ProposalReviewCard, { proposal: proposal(), onChanged: () => {} }));

    await click(buttonWith(host, 'accept')!);
    expect(host.querySelector('[role="alert"]')).toBeTruthy();
  });
});
