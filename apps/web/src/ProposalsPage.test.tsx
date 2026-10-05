// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { ProposalsPage } from './ProposalsPage.js';
import type { Proposal } from './proposalsApi.js';

let container: HTMLDivElement;
let root: Root | null = null;

function proposal(overrides: Partial<Proposal>): Proposal {
  return {
    id: 'p1',
    targetSlug: 'neon-drift',
    proposerUid: 'g:me',
    state: 'accepted',
    title: 'Tighter drift',
    description: 'Corners feel floaty.',
    base: { kind: 'repo', snapshotId: 's1', sha: 'abc' },
    createdAt: '2026-08-04T10:00:00Z',
    updatedAt: '2026-08-04T10:00:00Z',
    thread: [],
    platformOwned: true,
    ...overrides,
  };
}

async function draw(proposals: Proposal[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ proposals }))));
  root = createRoot(container);
  await act(async () => {
    root!.render(<ProposalsPage />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

describe('ProposalsPage', () => {
  it('reads an accepted catalog proposal as noted, with no withdraw', async () => {
    await draw([proposal({})]);
    expect(container.querySelector('.proposal-chip')?.textContent).toBe('noted');
    expect(container.textContent).toContain('The gamedev.pl team read your proposal');
    expect(container.textContent).not.toMatch(/pull request|GitHub/i);
    expect(container.textContent).not.toContain('Withdraw');
  });

  it('keeps "accepted" for a creator-owned game', async () => {
    await draw([proposal({ platformOwned: false })]);
    expect(container.querySelector('.proposal-chip')?.textContent).toBe('accepted');
    expect(container.textContent).toContain("the creator's agent is building it");
    expect(container.textContent).not.toContain('Withdraw');
  });

  it('says a data-applied accept waits on the creator publishing, not an agent', async () => {
    await draw([proposal({ platformOwned: false, acceptedVia: 'data' })]);
    expect(container.textContent).toContain('the creator applied your changes');
    expect(container.textContent).toContain('when the creator publishes');
    expect(container.textContent).not.toContain('agent');
  });

  it('says the same in Polish', async () => {
    await i18n.changeLanguage('pl');
    await draw([proposal({ platformOwned: false, acceptedVia: 'data' })]);
    expect(container.textContent).toContain('twórca zastosował twoje zmiany');
  });
});
