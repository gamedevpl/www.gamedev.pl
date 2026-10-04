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

describe('ProposalReviewCard seats', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reads "Mark as noted" on the platform seat, with no PR or publish wording', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ proposal: proposal() }) });
    vi.stubGlobal('fetch', fetchMock);
    const host = await mount(
      createElement(ProposalReviewCard, {
        proposal: proposal({ platformOwned: true }),
        scope: 'platform',
        onChanged: () => {},
      }),
    );

    expect(buttonWith(host, 'Accept')).toBeUndefined();
    expect(host.textContent).not.toMatch(/pull request|GitHub|\bPR\b|publish/i);
    // The platform has nobody to block on its own behalf.
    expect(buttonWith(host, 'Block this person')).toBeUndefined();

    await click(buttonWith(host, 'Mark as noted')!);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/proposals/p1/accept');
  });

  it('blocks the proposer after a second, explicit confirmation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const host = await mount(
      createElement(ProposalReviewCard, {
        proposal: proposal(),
        scope: 'mine',
        proposerHandle: 'tomek',
        onChanged: () => {},
      }),
    );

    await click(buttonWith(host, 'Block this person')!);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Block tomek?');

    await click(buttonWith(host, 'Block')!);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/me/contributor-blocks');
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({ uid: 'g:tomek' });
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Blocked');
  });
});
