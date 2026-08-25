// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogEntry } from './catalog.js';
import i18n from './i18n/index.js';
import { PartyPage } from './PartyPage.js';

const partyGame: CatalogEntry = {
  slug: 'party-karts',
  title: 'Party Karts',
  genre: 'Arcade racing (3D)',
  controls: 'Arrow keys',
  status: 'published',
  media: null,
  multiplayer: { mode: 'controllers', minPlayers: 2, maxPlayers: 4 },
  saves: null,
  world: null,
  sensing: null,
  editor: null,
  orientation: 'any',
  touch: null,
  submittedBy: null,
};

let container: HTMLDivElement;
let root: Root | null = null;

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
});

type RenderOverrides = {
  catalogStatus?: 'loading' | 'ready' | 'error';
  catalogError?: string | null;
  catalogEntries?: CatalogEntry[];
  onRetryCatalog?: () => void;
  partyError?: string | null;
};

function render(overrides: RenderOverrides = {}) {
  const onRetryCatalog = overrides.onRetryCatalog ?? vi.fn();
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(PartyPage, {
        catalogStatus: overrides.catalogStatus ?? 'ready',
        catalogError: overrides.catalogError ?? null,
        catalogEntries: overrides.catalogEntries ?? [],
        onPlayGame: vi.fn(),
        onPlayTogether: vi.fn(),
        onRetryCatalog,
        onCreateCustom: vi.fn(),
        partyError: overrides.partyError ?? null,
      }),
    );
  });
  return { onRetryCatalog };
}

describe('PartyPage', () => {
  it('shows a loading state instead of the empty message while the catalog is still loading', () => {
    render({ catalogStatus: 'loading' });

    expect(container.textContent).toContain('Loading games');
    expect(container.textContent).not.toContain('No party games live right now');
    expect(container.querySelector('.party-empty')).toBeNull();
  });

  it('offers Retry on a failed catalog load instead of claiming there are no party games', () => {
    const { onRetryCatalog } = render({ catalogStatus: 'error', catalogError: 'network down' });

    expect(container.textContent).toContain('network down');
    expect(container.textContent).not.toContain('No party games live right now');
    const retry = container.querySelector<HTMLButtonElement>('.load-error button');
    expect(retry).not.toBeNull();

    act(() => {
      retry?.click();
    });
    expect(onRetryCatalog).toHaveBeenCalled();
  });

  it('shows the empty message only once a ready catalog confirms there are no party games', () => {
    render({ catalogStatus: 'ready', catalogEntries: [] });

    expect(container.querySelector('.party-empty')).not.toBeNull();
    expect(container.textContent).toContain('No party games live right now');
  });

  it('renders the party rail once the catalog is ready with multiplayer entries', () => {
    render({ catalogStatus: 'ready', catalogEntries: [partyGame] });

    expect(container.querySelector('.party-empty')).toBeNull();
    expect(container.textContent).toContain('Party Karts');
  });

  it('surfaces a soft-refresh error without hiding the last-good rail behind it', () => {
    const { onRetryCatalog } = render({
      catalogStatus: 'ready',
      catalogError: 'refresh failed',
      catalogEntries: [partyGame],
    });

    expect(container.textContent).toContain('refresh failed');
    // The stale rail stays visible; the banner does not replace it.
    expect(container.textContent).toContain('Party Karts');
    expect(container.querySelector('.party-empty')).toBeNull();

    const retry = container.querySelector<HTMLButtonElement>('.catalog-refresh-error__retry');
    expect(retry).not.toBeNull();
    act(() => {
      retry?.click();
    });
    expect(onRetryCatalog).toHaveBeenCalled();
  });

  it('shows a failed Play Together attempt next to the rail, not off-screen below it', () => {
    render({
      catalogStatus: 'ready',
      catalogEntries: [partyGame],
      partyError: 'Could not start the lobby.',
    });

    const errorEl = container.querySelector('.party-error');
    expect(errorEl).not.toBeNull();
    expect(errorEl?.textContent).toBe('Could not start the lobby.');

    // Reads above the rail, not buried below the custom-game pitch.
    const rail = container.querySelector('.catalog-rail-section');
    expect(rail).not.toBeNull();
    expect(errorEl!.compareDocumentPosition(rail!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
