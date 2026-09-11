// @vitest-environment jsdom

// GA-06: every way the language service can fail to show up.

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeSurface } from './CodeSurface.js';
import { resetCodeSurfaceSessionState } from './codeSurfaceSessionState.js';
import * as codeSurfaceApi from './codeSurfaceApi.js';
import * as codeSurfaceLanguageService from './codeSurfaceLanguageService.js';
import i18n from '../../i18n/index.js';

type CapturedEditorProps = {
  languageService?: { worker: unknown; path: string };
  onGotoDefinition?: (path: string, from: number, to: number) => void;
  initialSelection?: { anchor: number; head: number };
  fetchGhostText?: (prefixWindow: string, suffixWindow: string, signal: AbortSignal) => Promise<string>;
};
let lastEditorProps: CapturedEditorProps | null = null;
// GA-09: the mock re-renders after clearing — record every value seen.
let capturedInitialSelections: unknown[] = [];

vi.mock('./CodeMirrorEditor.js', () => ({
  default: (
    props: { value: string; onChange: (value: string) => void; languageService?: unknown } & CapturedEditorProps,
  ) => {
    lastEditorProps = props;
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
    fetchCodeSurfaceKitDeclaration: vi.fn(),
    fetchCodeSurfaceCompletion: vi.fn(),
  };
});

vi.mock('./codeSurfaceLanguageService.js', () => ({
  createCodeSurfaceLanguageService: vi.fn(),
  // Real toVfsPath/fromVfsPath, not mocks — CodeSurface.tsx calls them directly.
  toVfsPath: (path: string) => (path.startsWith('/') ? path : `/${path}`),
  fromVfsPath: (path: string) => (path.startsWith('/') ? path.slice(1) : path),
  KIT_DECLARATION_PATH: 'shared/game-kit.d.ts',
}));

const mockedApi = vi.mocked(codeSurfaceApi);
const mockedLanguageService = vi.mocked(codeSurfaceLanguageService);

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
      { path: 'GAME.json', content: '{"engine":{"modules":[]}}' },
    ],
    ...overrides,
  };
}

describe('CodeSurface language-service degradation (GA-06)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    resetCodeSurfaceSessionState();
    lastEditorProps = null;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedApi.fetchCodeSurfaceSources.mockReset();
    mockedApi.stageCodeSurfaceFile.mockReset();
    mockedApi.fetchCodeSurfaceKitDeclaration.mockReset();
    mockedLanguageService.createCodeSurfaceLanguageService.mockReset();
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

  it('never starts a worker for a read-only surface', async () => {
    mockedApi.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor({ readOnly: true, reason: 'agent_round' }));
    mockedApi.fetchCodeSurfaceKitDeclaration.mockResolvedValue(null);

    await render();

    expect(mockedLanguageService.createCodeSurfaceLanguageService).not.toHaveBeenCalled();
  });

  it('still starts the worker, without the kit file, when the kit-declaration fetch fails', async () => {
    mockedApi.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    mockedApi.fetchCodeSurfaceKitDeclaration.mockResolvedValue(null);
    mockedLanguageService.createCodeSurfaceLanguageService.mockResolvedValue({
      worker: {} as never,
      updateFile: vi.fn(),
      destroy: vi.fn(),
    });

    await render();

    expect(mockedLanguageService.createCodeSurfaceLanguageService).toHaveBeenCalledWith(
      { 'game.ts': 'export const boot = () => {};' },
      null,
    );
    // GAME.json isn't .ts — the vfs must not be seeded.
    expect(mockedLanguageService.createCodeSurfaceLanguageService).not.toHaveBeenCalledWith(
      expect.objectContaining({ 'GAME.json': expect.anything() }),
      expect.anything(),
    );
  });

  it('keeps plain editing when the worker never resolves (chunk-load or init failure)', async () => {
    mockedApi.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    mockedApi.fetchCodeSurfaceKitDeclaration.mockResolvedValue(null);
    mockedLanguageService.createCodeSurfaceLanguageService.mockResolvedValue(null);

    await render();

    expect(container.querySelector('textarea')).not.toBeNull();
    expect(lastEditorProps?.languageService).toBeUndefined();
  });

  it('wires the ready worker into the open .ts file once it resolves', async () => {
    mockedApi.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    mockedApi.fetchCodeSurfaceKitDeclaration.mockResolvedValue({ engineRef: 'v1', declaration: 'declare const x: 1;' });
    const worker = {} as never;
    mockedLanguageService.createCodeSurfaceLanguageService.mockResolvedValue({
      worker,
      updateFile: vi.fn(),
      destroy: vi.fn(),
    });

    await render();

    expect(mockedLanguageService.createCodeSurfaceLanguageService).toHaveBeenCalledWith(
      { 'game.ts': 'export const boot = () => {};' },
      'declare const x: 1;',
    );
    // vfs roots paths at "/"; facet path must match the worker's seed.
    expect(lastEditorProps?.languageService).toEqual({ worker, path: '/game.ts' });
  });

  it('syncs a saved .ts file to the ready worker, without touching non-.ts saves', async () => {
    mockedApi.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    mockedApi.fetchCodeSurfaceKitDeclaration.mockResolvedValue(null);
    const updateFile = vi.fn();
    mockedLanguageService.createCodeSurfaceLanguageService.mockResolvedValue({
      worker: {} as never,
      updateFile,
      destroy: vi.fn(),
    });
    mockedApi.stageCodeSurfaceFile.mockResolvedValue({
      accepted: true,
      path: 'game.ts',
      bytes: 10,
      staged: { totalBytes: 10, maxBytes: 1_000_000, maxFiles: 60, updatedAt: null },
    });

    await render();

    const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(textarea, 'export const boot = () => { /* edited */ };');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(mockedApi.stageCodeSurfaceFile).toHaveBeenCalledWith(
      'sky-dodge',
      'game.ts',
      expect.stringContaining('edited'),
      { rebuild: false },
    );
    expect(updateFile).toHaveBeenCalledWith('game.ts', expect.stringContaining('edited'));
  });

  it('tears the worker down on unmount', async () => {
    mockedApi.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    mockedApi.fetchCodeSurfaceKitDeclaration.mockResolvedValue(null);
    const destroy = vi.fn();
    mockedLanguageService.createCodeSurfaceLanguageService.mockResolvedValue({
      worker: {} as never,
      updateFile: vi.fn(),
      destroy,
    });

    await render();
    await act(async () => root.unmount());
    root = createRoot(container);

    expect(destroy).toHaveBeenCalled();
  });
});

describe('CodeSurface goto-definition (GA-09)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    resetCodeSurfaceSessionState();
    lastEditorProps = null;
    capturedInitialSelections = [];
    mockedApi.fetchCodeSurfaceSources.mockReset();
    mockedApi.fetchCodeSurfaceKitDeclaration.mockReset();
    mockedLanguageService.createCodeSurfaceLanguageService.mockReset();
    mockedApi.fetchCodeSurfaceSources.mockResolvedValue(
      sourcesFor({
        files: [
          { path: 'game.ts', content: 'export const boot = () => {};' },
          { path: 'game/render.ts', content: 'export const paint = () => {};' },
        ],
      }),
    );
    mockedApi.fetchCodeSurfaceKitDeclaration.mockResolvedValue({
      engineRef: 'v1',
      declaration: 'interface GameKitGameContext {\n  gfx: unknown;\n}\n',
    });
    mockedLanguageService.createCodeSurfaceLanguageService.mockResolvedValue({
      worker: {} as never,
      updateFile: vi.fn(),
      destroy: vi.fn(),
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function render(slug = 'sky-dodge') {
    await act(async () => {
      root.render(createElement(CodeSurface, { slug, onBack: () => {} }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('switches tabs and hands the target editor an initial selection', async () => {
    await render();
    expect(container.querySelector('textarea')!.value).toContain('boot');

    await act(async () => {
      lastEditorProps?.onGotoDefinition?.('/game/render.ts', 7, 12);
      await Promise.resolve();
    });

    expect(container.querySelector('.code-surface-rail-item.is-active')?.textContent).toContain('game/render.ts');
    expect(capturedInitialSelections).toContainEqual({ anchor: 7, head: 12 });
  });

  it('opens a read-only kit viewer for a jump into shared/game-kit.d.ts', async () => {
    await render();

    await act(async () => {
      lastEditorProps?.onGotoDefinition?.('/shared/game-kit.d.ts', 34, 37);
      await Promise.resolve();
    });

    const dialog = container.querySelector('.code-surface-kit-viewer');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('GameKitGameContext');
    expect(container.querySelector('.is-jump-target')).not.toBeNull();
    // Still on game.ts — the kit hop leaves it alone.
    expect(container.querySelector('.code-surface-rail-item.is-active')?.textContent).toContain('game.ts');
  });

  it('ignores a jump target that matches no known file (e.g. a lib .d.ts)', async () => {
    await render();
    const activeBefore = container.querySelector('.code-surface-rail-item.is-active')?.textContent;

    await act(async () => {
      lastEditorProps?.onGotoDefinition?.('/lib.es2022.d.ts', 0, 4);
      await Promise.resolve();
    });

    expect(container.querySelector('.code-surface-rail-item.is-active')?.textContent).toBe(activeBefore);
    expect(container.querySelector('.code-surface-kit-viewer')).toBeNull();
  });
});

describe('CodeSurface ghost text (TA-02)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    resetCodeSurfaceSessionState();
    lastEditorProps = null;
    mockedApi.fetchCodeSurfaceSources.mockReset();
    mockedApi.fetchCodeSurfaceKitDeclaration.mockReset();
    mockedApi.fetchCodeSurfaceCompletion.mockReset();
    mockedLanguageService.createCodeSurfaceLanguageService.mockReset();
    mockedApi.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    mockedApi.fetchCodeSurfaceKitDeclaration.mockResolvedValue(null);
    mockedApi.fetchCodeSurfaceCompletion.mockResolvedValue('resolve()');
    mockedLanguageService.createCodeSurfaceLanguageService.mockResolvedValue({
      worker: {} as never,
      updateFile: vi.fn(),
      destroy: vi.fn(),
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function render(slug = 'sky-dodge') {
    await act(async () => {
      root.render(createElement(CodeSurface, { slug, onBack: () => {} }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('forwards a fetch to the open file, through fetchCodeSurfaceCompletion', async () => {
    await render();
    const controller = new AbortController();

    const result = await lastEditorProps?.fetchGhostText?.('const x = ', ';', controller.signal);

    expect(mockedApi.fetchCodeSurfaceCompletion).toHaveBeenCalledWith(
      'sky-dodge',
      'game.ts',
      'const x = ',
      ';',
      controller.signal,
    );
    expect(result).toBe('resolve()');
  });

  it('never fetches for a non-TypeScript file — the prompt only knows TypeScript', async () => {
    await render();
    const jsonTab = [...container.querySelectorAll('.code-surface-rail-item')].find((button) =>
      button.textContent?.includes('GAME.json'),
    ) as HTMLButtonElement;
    await act(async () => {
      jsonTab.click();
    });

    const result = await lastEditorProps?.fetchGhostText?.('{', '}', new AbortController().signal);

    expect(result).toBe('');
    expect(mockedApi.fetchCodeSurfaceCompletion).not.toHaveBeenCalled();
  });
});
