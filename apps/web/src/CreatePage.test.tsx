// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreatePage } from './CreatePage.js';
import type { CatalogEntry } from './catalog.js';
import i18n from './i18n/index.js';

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

function makeEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    slug: 'sky-dodge',
    title: 'Sky Dodge',
    genre: 'Arcade',
    controls: 'Arrow keys',
    status: 'published',
    media: null,
    multiplayer: null,
    saves: null,
    world: null,
    sensing: null,
    orientation: 'any',
    touch: null,
    submittedBy: 'gamedevpl',
    ...overrides,
  };
}

describe('CreatePage', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the headline, composer, steps, builder lanes, and proof strip', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const catalogEntries = [
      makeEntry({ slug: 'sky-dodge', genre: 'Arcade' }),
      makeEntry({
        slug: 'arena-tag',
        genre: 'Party',
        multiplayer: { mode: 'controllers', minPlayers: 2, maxPlayers: 4 },
      }),
      makeEntry({ slug: 'block-cascade', genre: 'Puzzle' }),
    ];

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CreatePage, {
          initialPrompt: '',
          retryKey: 'blank',
          catalogEntries,
          onPlayGame: vi.fn(),
          submissionStatus: 'idle',
          submissionError: null,
          onSubmitSpec: vi.fn(),
          mockStatus: 'idle',
          mockError: null,
          onGenerateMock: vi.fn(),
          onPlatformBuilderAvailability: vi.fn(),
        }),
      );
      await flushEffects();
    });

    expect(container.querySelector('.create-headline')?.textContent).toBeTruthy();
    // The composer is reused as-is; same input the home page ships.
    expect(container.querySelector('.big-prompt-input')).not.toBeNull();

    const steps = container.querySelectorAll('.create-step');
    expect(steps).toHaveLength(4);

    const laneTitles = Array.from(container.querySelectorAll('.create-builder-lane-title')).map((el) =>
      el.textContent?.trim(),
    );
    expect(laneTitles).toContain('Gamedev.pl coding agent');
    expect(laneTitles).toContain('My own coding agent');

    const stats = Array.from(container.querySelectorAll('.create-proof-stat strong')).map((el) => el.textContent);
    expect(stats).toEqual(['3', '3', '1']);

    // No ETA anywhere — a wide median reads as "give up".
    expect(container.textContent).not.toMatch(/\b(median|ETA|minutes|hours)\b/i);

    await act(async () => root.unmount());
  });
});
