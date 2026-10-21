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

describe('ProposalReviewCard text proposals', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('leads a text proposal with its description and offers no play or diff', async () => {
    const onPlay = vi.fn();
    const host = await mount(
      createElement(ProposalReviewCard, {
        proposal: proposal({
          kind: 'text',
          gate: undefined,
          description: 'Add a slow-motion power-up after every third level.',
        }),
        onChanged: () => {},
        onPlay,
      }),
    );
    const description = host.querySelector('.proposal-description.is-text');
    expect(description?.textContent).toBe('Add a slow-motion power-up after every third level.');
    expect(host.querySelector('.proposal-chip')?.textContent).toBe('text suggestion');
    expect(buttonWith(host, 'Play it')).toBeUndefined();
    expect(buttonWith(host, 'View changes')).toBeUndefined();
    expect(buttonWith(host, 'Accept')).toBeDefined();
    expect(buttonWith(host, 'Request changes')).toBeUndefined();
    expect(host.querySelector('.propose-note')?.textContent).toContain("from the proposer's description");
  });

  it('keeps play and diff on a code proposal', async () => {
    const host = await mount(
      createElement(ProposalReviewCard, { proposal: proposal(), onChanged: () => {}, onPlay: vi.fn() }),
    );
    expect(host.querySelector('.proposal-description.is-text')).toBeNull();
    expect(buttonWith(host, 'Play it')).toBeDefined();
    expect(buttonWith(host, 'View changes')).toBeDefined();
  });
});
