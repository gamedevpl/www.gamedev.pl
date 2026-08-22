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

  it('renders the headline, composer, steps, builder lanes, and a real-game showcase', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const catalogEntries = [
      makeEntry({ slug: 'sky-dodge', title: 'Sky Dodge', genre: 'Arcade' }),
      makeEntry({
        slug: 'arena-tag',
        title: 'Arena Tag',
        genre: 'Party',
        multiplayer: { mode: 'controllers', minPlayers: 2, maxPlayers: 4 },
      }),
      makeEntry({ slug: 'block-cascade', title: 'Block Cascade', genre: 'Puzzle' }),
    ];

    const onPlayGame = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CreatePage, {
          initialPrompt: '',
          retryKey: 'blank',
          catalogEntries,
          onPlayGame,
          submissionStatus: 'idle',
          submissionError: null,
          onSubmitSpec: vi.fn(),
          onPlatformBuilderAvailability: vi.fn(),
        }),
      );
      await flushEffects();
    });

    expect(container.querySelector('.create-headline')?.textContent).toBeTruthy();
    // The composer is reused as-is; same input the home page ships.
    expect(container.querySelector('.big-prompt-input')).not.toBeNull();

    // Click-to-fill example chips actually fill the composer.
    const chip = container.querySelector<HTMLButtonElement>('.prompt-example-chip');
    expect(chip).not.toBeNull();
    await act(async () => {
      chip?.click();
    });
    const promptInput = container.querySelector<HTMLInputElement>('.big-prompt-input');
    expect(promptInput?.value).toBe(chip?.textContent);

    const steps = container.querySelectorAll('.create-step');
    expect(steps).toHaveLength(4);
    expect(container.textContent).toContain('01');
    expect(container.textContent).toContain("A human reviews, then it's live");

    const laneTitles = Array.from(container.querySelectorAll('.create-builder-lane-title')).map((el) =>
      el.textContent?.trim(),
    );
    expect(laneTitles).toContain('Gamedev.pl coding agent');
    expect(laneTitles).toContain('My own coding agent');
    expect(container.textContent).toContain('Default');
    expect(container.textContent).toContain('Free to use');
    expect(container.textContent).toContain('Claude Code');

    // The showcase is real catalog entries, not invented ones.
    expect(container.textContent).toContain('Made exactly this way');
    expect(container.textContent).toContain('Sky Dodge');
    expect(container.textContent).toContain('Arena Tag');

    // A wide median build time reads as "give up" — never state one.
    expect(container.textContent).not.toMatch(/\b(median|ETA)\b/i);

    await act(async () => root.unmount());
  });
});
