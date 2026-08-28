// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeSurface } from './CodeSurface.js';
import { resetCodeSurfaceSessionState } from './codeSurfaceSessionState.js';
import * as codeSurfaceApi from './codeSurfaceApi.js';
import i18n from '../../i18n/index.js';

vi.mock('./CodeMirrorEditor.js', () => ({
  default: (props: { value: string; onChange: (value: string) => void }) =>
    createElement('textarea', {
      className: 'code-surface-editor',
      value: props.value,
      onChange: (event: { target: { value: string } }) => props.onChange(event.target.value),
    }),
}));

vi.mock('./codeSurfaceApi.js', async () => {
  const actual = await vi.importActual<typeof import('./codeSurfaceApi.js')>('./codeSurfaceApi.js');
  return {
    ...actual,
    fetchCodeSurfaceSources: vi.fn(),
    stageCodeSurfaceFile: vi.fn(),
    deleteCodeSurfaceFile: vi.fn(),
    rebuildCodeSurfaceStage: vi.fn(),
    requestCodeSurfacePreview: vi.fn(),
    typecheckCodeSurface: vi.fn(),
    discardCodeSurfaceEdits: vi.fn(),
    deliverCodeSurface: vi.fn(),
    restoreCodeSurfaceFile: vi.fn(),
  };
});

vi.mock('./webmcp.js', async () => {
  const actual = await vi.importActual<typeof import('./webmcp.js')>('./webmcp.js');
  return { ...actual, registerCodeSurfaceWebMcpTools: vi.fn(() => () => {}) };
});

vi.mock('./connectApi.js', async () => {
  const actual = await vi.importActual<typeof import('./connectApi.js')>('./connectApi.js');
  return { ...actual, getCreatorAgentKey: vi.fn().mockResolvedValue({ revoked: true, keyGeneration: 1 }) };
});

const mocked = vi.mocked(codeSurfaceApi);

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

function sourcesFor(files: Array<{ path: string; content: string }>): codeSurfaceApi.CodeSurfaceSources {
  return {
    slug: 'sky-dodge',
    version: 'v1',
    readOnly: false,
    deleted: [],
    staged: { totalBytes: 0, maxBytes: 1_000_000, maxFiles: 60, updatedAt: null },
    files,
  };
}

describe('CodeSurface explorer', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    resetCodeSurfaceSessionState();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocked.fetchCodeSurfaceSources.mockReset();
    mocked.stageCodeSurfaceFile.mockReset();
    mocked.deleteCodeSurfaceFile.mockReset();
    mocked.rebuildCodeSurfaceStage.mockReset();
    mocked.requestCodeSurfacePreview.mockReset();
    mocked.rebuildCodeSurfaceStage.mockResolvedValue({ scheduled: true });
    mocked.requestCodeSurfacePreview.mockResolvedValue({ html: '<html></html>', engineRef: 'abc123' });
    mocked.stageCodeSurfaceFile.mockResolvedValue({
      accepted: true,
      path: 'entities/player.ts',
      bytes: 10,
      staged: { totalBytes: 10, maxBytes: 1_000_000, maxFiles: 60, updatedAt: null },
    });
    mocked.deleteCodeSurfaceFile.mockResolvedValue({
      accepted: true,
      path: 'game.ts',
      staged: { totalBytes: 0, maxBytes: 1_000_000, maxFiles: 60, updatedAt: null },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  async function render() {
    await act(async () => {
      root.render(createElement(CodeSurface, { slug: 'sky-dodge', onBack: () => {} }));
    });
    await act(async () => {
      await flush();
    });
  }

  function tool(label: string): HTMLButtonElement {
    return [...container.querySelectorAll<HTMLButtonElement>('.code-surface-tree-tool')].find(
      (button) => button.getAttribute('aria-label') === label,
    )!;
  }

  function setInput(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('creates an empty folder in the tree after naming it', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor([{ path: 'game.ts', content: 'export {};\n' }]));
    await render();
    await act(async () => {
      tool('New folder')!.click();
    });
    const input = document.querySelector<HTMLInputElement>('[data-testid="code-tree-prompt"] input')!;
    await act(async () => {
      setInput(input, 'entities');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="code-tree-prompt-submit"]')!.click();
    });
    expect(container.querySelector('[data-path="entities"]')?.textContent).toContain('entities');
    expect(mocked.stageCodeSurfaceFile).not.toHaveBeenCalled();
  });

  it('stages a new file after a name prompt', async () => {
    mocked.fetchCodeSurfaceSources
      .mockResolvedValueOnce(sourcesFor([{ path: 'game.ts', content: 'export {};\n' }]))
      .mockResolvedValueOnce(
        sourcesFor([
          { path: 'game.ts', content: 'export {};\n' },
          { path: 'entities/player.ts', content: 'export {};\n' },
        ]),
      );
    await render();
    await act(async () => {
      tool('New file')!.click();
    });
    const input = document.querySelector<HTMLInputElement>('[data-testid="code-tree-prompt"] input')!;
    await act(async () => {
      setInput(input, 'entities/player.ts');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="code-tree-prompt-submit"]')!.click();
      await flush();
    });
    expect(mocked.stageCodeSurfaceFile).toHaveBeenCalledWith('sky-dodge', 'entities/player.ts', 'export {};\n', {
      rebuild: false,
    });
  });

  it('moves a file only after the destination is confirmed', async () => {
    mocked.fetchCodeSurfaceSources
      .mockResolvedValueOnce(
        sourcesFor([
          { path: 'game.ts', content: 'export const boot = () => {};\n' },
          { path: 'entities/player.ts', content: 'export {};\n' },
        ]),
      )
      .mockResolvedValueOnce(
        sourcesFor([
          { path: 'entities/player.ts', content: 'export {};\n' },
          { path: 'entities/boot.ts', content: 'export const boot = () => {};\n' },
        ]),
      );
    await render();
    const move = [
      ...container.querySelectorAll<HTMLButtonElement>('[data-path="game.ts"] .code-surface-tree-row-action'),
    ][0]!;
    await act(async () => {
      move.click();
    });
    const input = document.querySelector<HTMLInputElement>('[data-testid="code-tree-prompt"] input')!;
    await act(async () => {
      setInput(input, 'entities/boot.ts');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="code-tree-prompt-submit"]')!.click();
    });
    expect(mocked.stageCodeSurfaceFile).not.toHaveBeenCalled();
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="code-tree-confirm"]')!.click();
      await flush();
    });
    expect(mocked.stageCodeSurfaceFile).toHaveBeenCalledWith(
      'sky-dodge',
      'entities/boot.ts',
      'export const boot = () => {};\n',
      { rebuild: false },
    );
    expect(mocked.deleteCodeSurfaceFile).toHaveBeenCalledWith('sky-dodge', 'game.ts');
  });

  it('uploads a file only after confirming an overwrite', async () => {
    mocked.fetchCodeSurfaceSources
      .mockResolvedValueOnce(sourcesFor([{ path: 'game.ts', content: 'export const boot = () => {};\n' }]))
      .mockResolvedValueOnce(sourcesFor([{ path: 'game.ts', content: 'export const next = () => {};\n' }]));
    await render();
    const input = container.querySelectorAll('input[type="file"]')[0] as HTMLInputElement;
    const file = new File(['export const next = () => {};\n'], 'game.ts', { type: 'text/plain' });
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    expect(mocked.stageCodeSurfaceFile).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="code-tree-confirm-dialog"]')?.textContent).toMatch(/replaced/i);
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="code-tree-confirm"]')!.click();
      await flush();
    });
    expect(mocked.stageCodeSurfaceFile).toHaveBeenCalledWith(
      'sky-dodge',
      'game.ts',
      'export const next = () => {};\n',
      { rebuild: false },
    );
  });

  it('reloads sources when a later write in a folder delete fails', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(
      sourcesFor([
        { path: 'game.ts', content: 'export {};\n' },
        { path: 'entities/a.ts', content: 'export const a = 1;\n' },
        { path: 'entities/b.ts', content: 'export const b = 2;\n' },
      ]),
    );
    mocked.deleteCodeSurfaceFile
      .mockResolvedValueOnce({
        accepted: true,
        path: 'entities/a.ts',
        staged: { totalBytes: 0, maxBytes: 1_000_000, maxFiles: 60, updatedAt: null },
      })
      .mockRejectedValueOnce(new Error('quota'));
    await render();
    const before = mocked.fetchCodeSurfaceSources.mock.calls.length;
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-path="entities"] .code-surface-file-option-delete')!.click();
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="code-tree-confirm"]')!.click();
      await flush();
    });
    expect(mocked.fetchCodeSurfaceSources.mock.calls.length).toBeGreaterThan(before);
  });

  it('strips a folder-picker wrapper that contains a fixed source file', async () => {
    mocked.fetchCodeSurfaceSources
      .mockResolvedValueOnce(sourcesFor([{ path: 'game.ts', content: 'export const boot = () => {};\n' }]))
      .mockResolvedValueOnce(
        sourcesFor([
          { path: 'game.ts', content: 'export const next = () => {};\n' },
          { path: 'GAME.json', content: '{}\n' },
        ]),
      );
    await render();
    const input = container.querySelectorAll('input[type="file"]')[1] as HTMLInputElement;
    const code = new File(['export const next = () => {};\n'], 'game.ts', { type: 'text/plain' });
    Object.defineProperty(code, 'webkitRelativePath', { value: 'my-game/game.ts' });
    const json = new File(['{}\n'], 'GAME.json', { type: 'application/json' });
    Object.defineProperty(json, 'webkitRelativePath', { value: 'my-game/GAME.json' });
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [code, json], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="code-tree-confirm"]')!.click();
      await flush();
    });
    expect(mocked.stageCodeSurfaceFile).toHaveBeenCalledWith(
      'sky-dodge',
      'game.ts',
      'export const next = () => {};\n',
      { rebuild: false },
    );
    expect(mocked.stageCodeSurfaceFile).toHaveBeenCalledWith('sky-dodge', 'GAME.json', '{}\n', { rebuild: false });
  });
});
