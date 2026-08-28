// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatorStudioView } from './CreatorStudioView.js';
import i18n from './i18n/index.js';
import type { StudioGame, StudioGamesResponse } from './studioApi.js';
import type { CodeSurfaceSources } from './surfaces/studio/codeSurfaceApi.js';

// Verifies the shortcut redirect: CreatorStudioView catches it outside Code.

const fetchStudioGames = vi.fn();
const fetchStudioHealth = vi.fn();
const fetchStudioScorecards = vi.fn();
const fetchStudioSuggestions = vi.fn();
let authUser: { uid: string; name: string } | null = null;

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: authUser, logout: vi.fn() }),
}));

vi.mock('./studioApi', async () => {
  const actual = await vi.importActual<typeof import('./studioApi.js')>('./studioApi.js');
  return {
    ...actual,
    fetchStudioGames: (...args: unknown[]) => fetchStudioGames(...args),
    fetchStudioHealth: (...args: unknown[]) => fetchStudioHealth(...args),
    fetchStudioScorecards: (...args: unknown[]) => fetchStudioScorecards(...args),
    fetchStudioSuggestions: (...args: unknown[]) => fetchStudioSuggestions(...args),
    submitImprovement: vi.fn(),
  };
});

vi.mock('./submissionApi', async () => {
  const actual = await vi.importActual<typeof import('./submissionApi.js')>('./submissionApi.js');
  return {
    ...actual,
    getSubmissionStatus: vi.fn(async () => ({ media: [] })),
  };
});

vi.mock('./surfaces/studio/codeSurfaceApi', async () => {
  const actual = await vi.importActual<typeof import('./surfaces/studio/codeSurfaceApi.js')>(
    './surfaces/studio/codeSurfaceApi.js',
  );
  return {
    ...actual,
    fetchCodeSurfaceSources: vi.fn(),
  };
});

// CodeMirror stand-in: jsdom cannot lay it out.
vi.mock('./surfaces/studio/CodeMirrorEditor.js', () => ({
  default: (props: { value: string; onChange: (value: string) => void }) =>
    createElement('textarea', {
      className: 'code-surface-editor',
      value: props.value,
      onChange: (event: { target: { value: string } }) => props.onChange(event.target.value),
    }),
}));

const mockedFetchCodeSurfaceSources = vi.mocked(
  (await import('./surfaces/studio/codeSurfaceApi.js')).fetchCodeSurfaceSources,
);

function studioShelf(games: StudioGame[]): StudioGamesResponse {
  return { games, truncated: false, totalGames: games.length };
}

function sourcesFor(overrides: Partial<CodeSurfaceSources> = {}): CodeSurfaceSources {
  return {
    slug: 'sky-dodge',
    version: 'v1',
    readOnly: false,
    deleted: [],
    staged: { totalBytes: 0, maxBytes: 1_000_000, maxFiles: 60, updatedAt: null },
    files: [{ path: 'game.ts', content: 'export const boot = () => {};' }],
    ...overrides,
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

async function pressGlobal(key: string, options: { shift?: boolean } = {}) {
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        ctrlKey: true,
        shiftKey: options.shift ?? false,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

describe('CreatorStudioView — Code actions shortcut reaches beyond the Code tab', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockReset();
    fetchStudioHealth.mockReset().mockResolvedValue({ days: [], truncated: false, games: [] });
    fetchStudioScorecards.mockReset().mockResolvedValue([]);
    fetchStudioSuggestions.mockReset().mockResolvedValue([]);
    mockedFetchCodeSurfaceSources.mockReset().mockResolvedValue(sourcesFor());
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  async function render(game: Partial<StudioGame> = {}) {
    await i18n.changeLanguage('en');
    fetchStudioGames.mockResolvedValue(
      studioShelf([
        {
          token: 'token-coded',
          title: 'Sky Dodge',
          createdAt: '2026-07-30T09:00:00.000Z',
          lastKnownStatus: 'building',
          slug: 'sky-dodge',
          codeSurface: true,
          editable: true,
          ...game,
        },
      ]),
    );
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onNavigate = vi.fn();
    await act(async () => {
      root.render(createElement(CreatorStudioView, { selectedGame: 'token-coded', onNavigate, onPlay: vi.fn() }));
    });
    await act(async () => {
      await fetchStudioGames.mock.results[0]?.value;
      await fetchStudioHealth.mock.results[0]?.value;
      await fetchStudioScorecards.mock.results[0]?.value;
      await fetchStudioSuggestions.mock.results[0]?.value;
      await flush();
    });
    return { container, root, onNavigate };
  }

  it('Ctrl+P from the thread tab switches to Code and opens quick open once sources load', async () => {
    const { container, root } = await render();
    expect(container.querySelector('[aria-label="Code"]')?.getAttribute('aria-pressed')).toBe('false');

    await pressGlobal('p');
    await act(async () => {
      await flush();
    });

    expect(container.querySelector('[aria-label="Code"]')?.getAttribute('aria-pressed')).toBe('true');
    const palette = container.querySelector('[data-testid="code-actions-menu"]');
    expect(palette).not.toBeNull();
    expect(palette?.textContent).toContain('game.ts');

    root.unmount();
  });

  it('Ctrl+Shift+F from the Edit tab switches to Code and opens project search', async () => {
    const { container, root } = await render();

    const editButton = container.querySelector<HTMLButtonElement>('[aria-label="Edit"]');
    await act(async () => {
      editButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.studio-edit-overlay:not(.studio-code-overlay)')).not.toBeNull();

    await pressGlobal('F', { shift: true });
    await act(async () => {
      await flush();
    });

    expect(container.querySelector('[aria-label="Code"]')?.getAttribute('aria-pressed')).toBe('true');
    const input = container.querySelector<HTMLInputElement>('.code-surface-palette-input');
    expect(input?.placeholder).toBe('Search in all files…');

    root.unmount();
  });

  it('a failed load drops the queued request instead of replaying it on the next successful open', async () => {
    mockedFetchCodeSurfaceSources.mockRejectedValueOnce(new Error('network blip'));
    const { container, root } = await render();

    await pressGlobal('p');
    await act(async () => {
      await flush();
    });
    expect(container.querySelector('[data-testid="code-actions-menu"]')).toBeNull();
    expect(container.querySelector('.code-surface-error')).not.toBeNull();

    const back = container.querySelector<HTMLButtonElement>('.code-surface .studio-head-action');
    await act(async () => {
      back!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.code-surface')).toBeNull();

    const codeButton = container.querySelector<HTMLButtonElement>('[aria-label="Code"]');
    await act(async () => {
      codeButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(container.querySelector('.code-surface-rail-item')?.textContent).toContain('game.ts');
    expect(container.querySelector('[data-testid="code-actions-menu"]')).toBeNull();

    root.unmount();
  });

  it('Escape without picking anything sends the creator back to where they were', async () => {
    const { container, root, onNavigate } = await render();
    expect(container.querySelector('[aria-label="Code"]')?.getAttribute('aria-pressed')).toBe('false');

    await pressGlobal('p');
    await act(async () => {
      await flush();
    });
    expect(container.querySelector('[data-testid="code-actions-menu"]')).not.toBeNull();
    onNavigate.mockClear();

    const input = container.querySelector<HTMLInputElement>('.code-surface-palette-input');
    await act(async () => {
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });

    expect(container.querySelector('[data-testid="code-actions-menu"]')).toBeNull();
    expect(container.querySelector('[aria-label="Code"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('.code-surface')).toBeNull();
    // Undoes the transient hop — Back must not land on Code.
    expect(onNavigate).toHaveBeenCalledWith('/studio/sky-dodge/thread', { replace: true });

    root.unmount();
  });

  it('picking a file from the shortcut-opened menu stays on Code, no snap back', async () => {
    const { container, root } = await render();

    await pressGlobal('p');
    await act(async () => {
      await flush();
    });
    const fileOption = Array.from(container.querySelectorAll<HTMLButtonElement>('.code-surface-palette-option')).find(
      (el) => el.textContent?.includes('game.ts'),
    );
    await act(async () => {
      fileOption!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="code-actions-menu"]')).toBeNull();
    expect(container.querySelector('[aria-label="Code"]')?.getAttribute('aria-pressed')).toBe('true');

    root.unmount();
  });

  it('does nothing when the active game has no Code surface — no tab switch, no preventDefault', async () => {
    const { container, root } = await render({ codeSurface: false });
    expect(container.querySelector('[aria-label="Code"]')).toBeNull();

    await pressGlobal('p');
    await act(async () => {
      await flush();
    });

    expect(container.querySelector('[data-testid="code-actions-menu"]')).toBeNull();
    expect(container.querySelector('.code-surface')).toBeNull();

    root.unmount();
  });
});
