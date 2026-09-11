// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeSurface } from './CodeSurface.js';
import { resetCodeSurfaceSessionState } from './codeSurfaceSessionState.js';
import * as codeSurfaceApi from './codeSurfaceApi.js';
import i18n from '../../i18n/index.js';

// CodeMirror stand-in: jsdom cannot lay it out; palette never needs it.

// Records initialSelection to check a quick-open switch triggers a focus jump.
let capturedInitialSelections: unknown[] = [];
vi.mock('./CodeMirrorEditor.js', () => ({
  default: (props: {
    value: string;
    onChange: (value: string) => void;
    initialSelection?: { anchor: number; head: number };
  }) => {
    capturedInitialSelections.push(props.initialSelection);
    return createElement('textarea', {
      className: 'code-surface-editor',
      value: props.value,
      onChange: (event: { target: { value: string } }) => props.onChange(event.target.value),
    });
  },
}));

vi.mock('./codeSurfaceApi.js', async () => {
  const actual = await vi.importActual<typeof import('./codeSurfaceApi.js')>('./codeSurfaceApi.js');
  return {
    ...actual,
    fetchCodeSurfaceSources: vi.fn(),
    stageCodeSurfaceFile: vi.fn(),
    rebuildCodeSurfaceStage: vi.fn(),
    typecheckCodeSurface: vi.fn(),
    discardCodeSurfaceEdits: vi.fn(),
    deliverCodeSurface: vi.fn(),
  };
});

const mocked = vi.mocked(codeSurfaceApi);

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

function sourcesFor(overrides: Partial<codeSurfaceApi.CodeSurfaceSources> = {}): codeSurfaceApi.CodeSurfaceSources {
  return {
    slug: 'sky-dodge',
    version: 'v1',
    readOnly: false,
    deleted: [],
    staged: { totalBytes: 0, maxBytes: 1_000_000, maxFiles: 60, updatedAt: null },
    files: [
      { path: 'game.ts', content: 'export const boot = () => {};' },
      { path: 'game/render.ts', content: 'export const paint = () => {};\nconst palette = [];' },
    ],
    ...overrides,
  };
}

describe('CodeSurface actions menu (VS Code-style palette)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    resetCodeSurfaceSessionState();
    capturedInitialSelections = [];
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocked.fetchCodeSurfaceSources.mockReset();
    mocked.stageCodeSurfaceFile.mockReset();
    mocked.rebuildCodeSurfaceStage.mockReset();
    mocked.typecheckCodeSurface.mockReset();
    mocked.discardCodeSurfaceEdits.mockReset();
    mocked.deliverCodeSurface.mockReset();
    mocked.rebuildCodeSurfaceStage.mockResolvedValue({ scheduled: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  async function render(slug = 'sky-dodge') {
    await act(async () => {
      root.render(createElement(CodeSurface, { slug, onBack: () => {} }));
    });
    await act(async () => {
      await flush();
    });
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

  async function typeIntoPalette(value: string) {
    const input = container.querySelector<HTMLInputElement>('.code-surface-palette-input')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return input;
  }

  async function pressOnPalette(key: string) {
    const input = container.querySelector<HTMLInputElement>('.code-surface-palette-input')!;
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    });
  }

  function menu() {
    return container.querySelector('[data-testid="code-actions-menu"]');
  }

  function options() {
    return [...container.querySelectorAll<HTMLButtonElement>('.code-surface-palette-option')];
  }

  it('Ctrl+P opens quick open; typing filters files and Enter opens the active one', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    await render();

    await pressGlobal('p');
    expect(menu()).not.toBeNull();
    // Empty query lists every file, in server order.
    expect(options().map((option) => option.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('game.ts'), expect.stringContaining('game/render.ts')]),
    );

    await typeIntoPalette('render');
    expect(options()).toHaveLength(1);
    expect(options()[0]!.textContent).toContain('game/render.ts');

    await pressOnPalette('Enter');
    expect(menu()).toBeNull();
    expect(container.querySelector('.code-surface-rail-item.is-active')?.textContent).toContain('game/render.ts');
    expect(container.querySelector('textarea')!.value).toContain('export const paint');
  });

  it('a quick-open switch to a different file rides the same jump the editor uses to claim focus', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    await render();

    await pressGlobal('p');
    await typeIntoPalette('render');
    await pressOnPalette('Enter');

    // pendingJump clears itself once consumed — a prior render carried it.
    expect(capturedInitialSelections).toContainEqual({ anchor: 0, head: 0 });
  });

  it('re-selecting the file already open is not treated as a jump — no selection reset', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    await render();
    capturedInitialSelections = [];

    await pressGlobal('p');
    await act(async () => {
      options()
        .find((option) => option.textContent?.includes('game.ts'))!
        .click();
    });

    expect(capturedInitialSelections.every((selection) => selection === undefined)).toBe(true);
  });

  it("typing `>` in quick open switches to commands, VS Code's own prefix", async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    await render();

    await pressGlobal('p');
    await typeIntoPalette('>');
    expect(options().map((option) => option.textContent?.trim())).toEqual(
      expect.arrayContaining([expect.stringContaining('Go to file'), expect.stringContaining('Back to thread')]),
    );
  });

  it('Ctrl+Shift+P opens the command palette and a filtered Publish command delivers', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(
      sourcesFor({
        files: [
          { path: 'game.ts', content: 'export const boot = () => { /* staged */ };', stagedBy: 'owner' },
          { path: 'game/render.ts', content: 'export const paint = () => {};' },
        ],
        staged: { totalBytes: 40, maxBytes: 1_000_000, maxFiles: 60, updatedAt: '2026-08-11T00:00:00.000Z' },
      }),
    );
    mocked.deliverCodeSurface.mockResolvedValue({
      accepted: true,
      slug: 'sky-dodge',
      version: 'v2',
      mode: 'publish',
      gateStarted: true,
    });

    await render();

    await pressGlobal('P', { shift: true });
    const input = container.querySelector<HTMLInputElement>('.code-surface-palette-input')!;
    expect(input.value).toBe('>');
    expect(options().map((option) => option.textContent?.trim())).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Publish'),
        expect.stringContaining('Save working copy now'),
        expect.stringContaining('Discard changes'),
      ]),
    );

    await typeIntoPalette('>publ');
    expect(options()).toHaveLength(1);
    await pressOnPalette('Enter');

    expect(menu()).toBeNull();
    await act(async () => {
      await flush();
    });
    expect(mocked.deliverCodeSurface).toHaveBeenCalledWith('sky-dodge', 'publish');
  });

  it('Ctrl+Shift+F searches every file and a clicked match jumps to its file', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    await render();

    await pressGlobal('F', { shift: true });
    expect(menu()).not.toBeNull();

    await typeIntoPalette('export const');
    // One hit per file, grouped under their path headers.
    const groups = [...container.querySelectorAll('.code-surface-palette-group')].map((group) => group.textContent);
    expect(groups).toEqual(['game.ts', 'game/render.ts']);
    expect(options()).toHaveLength(2);
    expect(container.querySelector('.code-surface-palette-foot')?.textContent).toContain('2 matches');

    await act(async () => {
      options()
        .find((option) => option.getAttribute('aria-label')?.includes('game/render.ts'))!
        .click();
    });

    expect(menu()).toBeNull();
    expect(container.querySelector('.code-surface-rail-item.is-active')?.textContent).toContain('game/render.ts');
  });

  it('read-only sessions keep navigation but list no editing commands', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor({ readOnly: true, reason: 'agent_round' }));
    await render();

    await pressGlobal('P', { shift: true });
    const labels = options().map((option) => option.textContent?.trim() ?? '');
    expect(labels.some((label) => label.includes('Back to thread'))).toBe(true);
    expect(labels.some((label) => label.includes('Go to file'))).toBe(true);
    expect(labels.some((label) => label.includes('Publish'))).toBe(false);
    expect(labels.some((label) => label.includes('Save working copy'))).toBe(false);

    // Quick open still works against the read-only tree.
    await pressGlobal('p');
    await typeIntoPalette('render');
    await pressOnPalette('Enter');
    expect(container.querySelector('.code-surface-rail-item.is-active')?.textContent).toContain('game/render.ts');
  });

  it('Escape closes the palette without acting', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    await render();

    await pressGlobal('p');
    expect(menu()).not.toBeNull();
    await pressOnPalette('Escape');
    expect(menu()).toBeNull();
    expect(container.querySelector('.code-surface-rail-item.is-active')?.textContent).toContain('game.ts');
  });
});
