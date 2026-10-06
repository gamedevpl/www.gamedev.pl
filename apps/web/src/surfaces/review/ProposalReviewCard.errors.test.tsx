// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { ProposalReviewCard } from './ProposalReviewCard.js';
import { reviewErrorKey } from './proposalErrors.js';
import type { Proposal } from '../../proposalsApi.js';

const PROPOSAL: Proposal = {
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
};

const flush = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

function reply(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body };
}

// Mounts the card, then clicks Accept against a refusing API.
async function acceptRefused(error: string, extra?: (url: string) => unknown) {
  const fetchMock = vi.fn(async (url: string) => {
    const other = extra?.(url);
    return other ?? reply(409, { error });
  });
  vi.stubGlobal('fetch', fetchMock);
  const onChanged = vi.fn();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  await act(async () => {
    createRoot(host).render(createElement(ProposalReviewCard, { proposal: PROPOSAL, onChanged }));
    await flush();
  });
  const accept = [...host.querySelectorAll('button')].find((button) => button.textContent === i18n.t('reviews.accept'));
  await act(async () => {
    accept!.click();
    await flush();
  });
  return { alert: host.querySelector('[role="alert"]')?.textContent ?? '', onChanged, fetchMock };
}

describe('ProposalReviewCard accept failures', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it.each([
    ['round_in_progress', 'already has a round building — accept again when it finishes'],
    ['quota_exhausted', "You've used today's rounds — try again tomorrow."],
    ['content_rejected', "didn't pass our content rules"],
    ['managed_unavailable', "The builder isn't available right now"],
    ['not_published', "isn't published right now"],
    ['stale_owner', "no longer this game's owner"],
    ['round_failed', "The round couldn't start"],
    ['round_unlinked', "The round couldn't start"],
  ])('explains %s specifically', async (code, text) => {
    const { alert } = await acceptRefused(code);
    expect(alert).toContain(text);
  });

  it('falls back to the generic message for an unknown code', async () => {
    const { alert } = await acceptRefused('something_new');
    expect(alert).toBe("That didn't send. Try again in a moment.");
  });

  it('refreshes the card when the proposal was superseded under the reviewer', async () => {
    const fresh = { ...PROPOSAL, state: 'superseded' as const };
    const { alert, onChanged } = await acceptRefused('superseded', (url) =>
      url.endsWith('/api/proposals/p1') ? reply(200, { proposal: fresh }) : undefined,
    );
    expect(alert).toContain('out of date');
    expect(onChanged).toHaveBeenCalledWith(fresh);
  });

  it('speaks Polish too', async () => {
    await i18n.changeLanguage('pl');
    const { alert } = await acceptRefused('quota_exhausted');
    expect(alert).toContain('spróbuj jutro');
  });
});

describe('reviewErrorKey', () => {
  const err = (code?: string) => Object.assign(new Error('x'), { code });

  it('maps note moderation on decline to the note copy, not the accept copy', () => {
    expect(reviewErrorKey(err('content_rejected'), 'decline')).toBe('reviews.errors.note_rejected');
    expect(reviewErrorKey(err('content_rejected'), 'accept')).toBe('reviews.errors.content_rejected');
  });

  it('keeps accept-only codes off the other actions', () => {
    expect(reviewErrorKey(err('quota_exhausted'), 'changes')).toBe('propose.errors.generic');
    expect(reviewErrorKey(err('not_reviewable'), 'changes')).toBe('reviews.errors.not_reviewable');
    expect(reviewErrorKey(new Error('network'), 'accept')).toBe('propose.errors.generic');
  });
});
