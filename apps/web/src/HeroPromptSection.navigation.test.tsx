// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeroPromptSection } from './HeroPromptSection.js';
import { NAVIGATE_EVENT } from './core/router.js';
import i18n from './i18n/index.js';

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

const mockCatalog = [
  {
    slug: 'mexico-86',
    title: "Mexico '86 Arcade Football",
    genre: 'sports',
    controls: 'Arrows / Enter / Tap to navigate; 1–4 to pick action',
    status: 'published',
    media: {
      screenshots: [
        { name: 'opening', file: 'opening.png' },
        { name: 'action', file: 'action.png' },
      ],
      video: null,
    },
    multiplayer: { mode: 'controllers' as const, minPlayers: 1, maxPlayers: 2 },
    saves: null,
    world: null,
    sensing: null,
    editor: null,
    orientation: 'landscape' as const,
    submittedBy: null,
  },
];

describe('HeroPromptSection navigation', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders matched title and thumbnail with game subpage links', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(HeroPromptSection, {
          initialPrompt: 'mexico',
          catalogEntries: mockCatalog,
          submissionStatus: 'idle',
          submissionError: null,
          onSubmitSpec: vi.fn(),
        }),
      );
      await flushEffects();
    });

    const thumbLink = container.querySelector<HTMLAnchorElement>('.matched-thumb-wrap');
    expect(thumbLink?.tagName.toLowerCase()).toBe('a');
    expect(thumbLink?.getAttribute('href')).toBe('/gamedevpl/mexico-86?via=composer_match');

    const titleLink = container.querySelector<HTMLAnchorElement>('.matched-title-link');
    expect(titleLink).not.toBeNull();
    expect(titleLink?.getAttribute('href')).toBe('/gamedevpl/mexico-86?via=composer_match');

    await act(async () => root.unmount());
  });

  it('calls onNavigate on title click when provided', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const onNavigate = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(HeroPromptSection, {
          initialPrompt: 'mexico',
          catalogEntries: mockCatalog,
          onNavigate,
          submissionStatus: 'idle',
          submissionError: null,
          onSubmitSpec: vi.fn(),
        }),
      );
      await flushEffects();
    });

    const titleLink = container.querySelector<HTMLAnchorElement>('.matched-title-link');
    expect(titleLink).not.toBeNull();

    await act(async () => {
      titleLink?.click();
      await flushEffects();
    });

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('/gamedevpl/mexico-86?via=composer_match');

    await act(async () => root.unmount());
  });

  it('dispatches popstate and NAVIGATE_EVENT when onNavigate is omitted', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const popstateSpy = vi.fn();
    const navigateEventSpy = vi.fn();
    window.addEventListener('popstate', popstateSpy);
    window.addEventListener(NAVIGATE_EVENT, navigateEventSpy);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(HeroPromptSection, {
          initialPrompt: 'mexico',
          catalogEntries: mockCatalog,
          submissionStatus: 'idle',
          submissionError: null,
          onSubmitSpec: vi.fn(),
        }),
      );
      await flushEffects();
    });

    const titleLink = container.querySelector<HTMLAnchorElement>('.matched-title-link');
    expect(titleLink).not.toBeNull();

    await act(async () => {
      titleLink?.click();
      await flushEffects();
    });

    expect(popstateSpy).toHaveBeenCalled();
    expect(navigateEventSpy).toHaveBeenCalled();

    window.removeEventListener('popstate', popstateSpy);
    window.removeEventListener(NAVIGATE_EVENT, navigateEventSpy);
    await act(async () => root.unmount());
  });
});
