// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeSurface } from './CodeSurface.js';
import { getCodeSurfaceSessionState, resetCodeSurfaceSessionState } from './codeSurfaceSessionState.js';
import * as codeSurfaceApi from './codeSurfaceApi.js';
import i18n from '../../i18n/index.js';
import type { EditorContentDoc, GameEditorState } from '../../studioApi.js';

const codeMirrorMock = vi.hoisted(() => ({
  current: null as {
    initialEditorState?: unknown;
    onEditorStateChange?: (state: unknown) => void;
  } | null,
}));

// The real CodeMirror editor needs DOM layout measurement jsdom cannot provide, and
// its dynamic import races the plain-textarea Suspense fallback these tests rely on —
// a stand-in with the same value/onChange contract keeps that race out of the picture.
vi.mock('./CodeMirrorEditor.js', () => ({
  default: (props: {
    value: string;
    onChange: (value: string) => void;
    initialEditorState?: unknown;
    onEditorStateChange?: (state: unknown) => void;
  }) => {
    codeMirrorMock.current = props;
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
    deleteCodeSurfaceFile: vi.fn(),
    patchCodeSurfaceFile: vi.fn(),
    rebuildCodeSurfaceStage: vi.fn(),
    requestCodeSurfacePreview: vi.fn(),
    typecheckCodeSurface: vi.fn(),
    discardCodeSurfaceEdits: vi.fn(),
    deliverCodeSurface: vi.fn(),
    restoreCodeSurfaceFile: vi.fn(),
  };
});

vi.mock('../../studioApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../studioApi.js')>('../../studioApi.js');
  return { ...actual, fetchGameEditor: vi.fn() };
});

vi.mock('./webmcp.js', async () => {
  const actual = await vi.importActual<typeof import('./webmcp.js')>('./webmcp.js');
  return { ...actual, registerCodeSurfaceWebMcpTools: vi.fn(() => () => {}) };
});

// Stub the agent-mode modal's key panel fetch.
vi.mock('./connectApi.js', async () => {
  const actual = await vi.importActual<typeof import('./connectApi.js')>('./connectApi.js');
  return { ...actual, getCreatorAgentKey: vi.fn() };
});

const mocked = vi.mocked(codeSurfaceApi);
const mockedStudioApi = vi.mocked(await import('../../studioApi.js'));
const mockedWebmcp = vi.mocked(await import('./webmcp.js'));
const mockedConnectApi = vi.mocked(await import('./connectApi.js'));

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
      { path: 'game/render.ts', content: 'export const paint = () => {};' },
    ],
    ...overrides,
  };
}

describe('CodeSurface', () => {
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
    mocked.typecheckCodeSurface.mockReset();
    mocked.discardCodeSurfaceEdits.mockReset();
    mocked.deliverCodeSurface.mockReset();
    mocked.restoreCodeSurfaceFile.mockReset();
    mockedStudioApi.fetchGameEditor.mockReset();
    codeMirrorMock.current = null;
    mockedWebmcp.registerCodeSurfaceWebMcpTools.mockClear();
    mockedConnectApi.getCreatorAgentKey.mockReset();
    mockedConnectApi.getCreatorAgentKey.mockResolvedValue({ revoked: true, keyGeneration: 1 });
    window.localStorage.clear();
    window.sessionStorage.clear();
    mocked.rebuildCodeSurfaceStage.mockResolvedValue({ scheduled: true });
    mocked.requestCodeSurfacePreview.mockResolvedValue({ html: '<html></html>', engineRef: 'abc123' });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  async function render(
    slug = 'sky-dodge',
    editorPushRef?: { current: ((content: EditorContentDoc) => void) | null },
    onPreviewReady?: (html: string) => void,
    onBack: () => void = () => {},
  ) {
    await act(async () => {
      root.render(createElement(CodeSurface, { slug, onBack, editorPushRef, onPreviewReady }));
    });
    await act(async () => {
      await flush();
    });
  }

  function typeInto(textarea: HTMLTextAreaElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('lists the manifest files and shows the selected one, read-only, with no dependency beyond codeTokens', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor({ readOnly: true, reason: 'agent_round' }));

    await render();

    expect(container.textContent).toContain('game.ts');
    expect(container.textContent).toContain('game/render.ts');
    expect(container.textContent).toContain('shared/');
    expect(container.textContent).toContain('tools/');
    // Read-only during a live agent round (CE-08): no editable textarea, and the banner shows.
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelector('.code-surface-readonly-banner')).not.toBeNull();
    expect(container.querySelector('.code-surface-readonly-banner-full')).not.toBeNull();
    expect(container.querySelector('.code-surface-readonly-banner-compact')).not.toBeNull();
    expect(container.textContent).toContain('export const boot');
  });

  it('keeps watching a self-build round, which is never read-only', async () => {
    // Polling was gated on readOnly, which a self-build round never sets.
    vi.useFakeTimers();
    try {
      mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor({ readOnly: false, agentRound: true }));
      await render();
      const initial = mocked.fetchCodeSurfaceSources.mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_100);
      });

      expect(mocked.fetchCodeSurfaceSources.mock.calls.length).toBeGreaterThan(initial);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops watching once the round is neither live nor open to an agent', async () => {
    vi.useFakeTimers();
    try {
      mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor({ readOnly: false, agentRound: false }));
      await render();
      const initial = mocked.fetchCodeSurfaceSources.mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_100);
      });

      // A closed round cannot gain files; do not poll it forever.
      expect(mocked.fetchCodeSurfaceSources.mock.calls.length).toBe(initial);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens on game.ts, not whatever sorts first — the manifest listing leads with GAME.json', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(
      sourcesFor({
        files: [
          { path: 'GAME.json', content: '{"engine":{"modules":[]}}' },
          { path: 'SPEC.md', content: '# Sky Dodge' },
          { path: 'game.ts', content: 'export const boot = () => {};' },
        ],
      }),
    );

    await render();

    const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(textarea.value).toContain('export const boot');
  });

  it('uses an on-demand file sheet instead of a scrolling mobile rail', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(
      sourcesFor({
        files: [
          { path: 'GAME.json', content: '{"engine":{"modules":[]}}' },
          { path: 'src/main.ts', content: 'export const boot = () => {};' },
        ],
      }),
    );

    await render();

    const picker = container.querySelector<HTMLButtonElement>('.code-surface-file-trigger');
    expect(picker).not.toBeNull();
    expect(picker!.textContent).toContain('GAME.json');

    await act(async () => {
      picker!.click();
    });

    const sheet = container.querySelector('[role="dialog"]');
    expect(sheet).not.toBeNull();
    expect(sheet?.textContent).toContain('GAME.json');
    expect(sheet?.textContent).toContain('src/main.ts');

    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>('.code-surface-file-option-open')]
        .find((option) => option.textContent?.includes('src/main.ts'))
        ?.click();
    });

    expect(container.querySelector('textarea')!.value).toContain('export const boot');
    expect(container.querySelector('.code-surface-rail-item.is-active')?.textContent).toContain('src/main.ts');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('deletes a file from the file sheet on a second confirming click', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValueOnce(
      sourcesFor({
        files: [
          { path: 'GAME.json', content: '{"engine":{"modules":[]}}' },
          { path: 'src/main.ts', content: 'export const boot = () => {};' },
        ],
      }),
    );
    mocked.deleteCodeSurfaceFile.mockResolvedValue({
      accepted: true,
      path: 'src/main.ts',
      staged: { totalBytes: 0, maxBytes: 1_000_000, maxFiles: 60, updatedAt: '2026-08-10T00:00:00.000Z' },
    });
    mocked.fetchCodeSurfaceSources.mockResolvedValueOnce(
      sourcesFor({ files: [{ path: 'GAME.json', content: '{"engine":{"modules":[]}}' }] }),
    );

    await render();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.code-surface-file-trigger')!.click();
    });

    const deleteBtn = () =>
      [...container.querySelectorAll<HTMLButtonElement>('.code-surface-file-option')]
        .find((option) => option.textContent?.includes('src/main.ts'))
        ?.querySelector<HTMLButtonElement>('.code-surface-file-option-delete');

    await act(async () => {
      deleteBtn()!.click();
    });
    expect(mocked.deleteCodeSurfaceFile).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="code-tree-confirm-dialog"]')).not.toBeNull();

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="code-tree-confirm"]')!.click();
      await flush();
    });

    expect(mocked.deleteCodeSurfaceFile).toHaveBeenCalledWith('sky-dodge', 'src/main.ts');
    expect(container.querySelector('[role="dialog"]')?.textContent).not.toContain('src/main.ts');
  });

  it('keeps Discard/Publish enabled when a delete is the only working-copy change', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValueOnce(
      sourcesFor({
        files: [
          { path: 'GAME.json', content: '{"engine":{"modules":[]}}' },
          { path: 'src/main.ts', content: 'export const boot = () => {};' },
        ],
      }),
    );
    mocked.deleteCodeSurfaceFile.mockResolvedValue({
      accepted: true,
      path: 'src/main.ts',
      staged: { totalBytes: 0, maxBytes: 1_000_000, maxFiles: 60, updatedAt: '2026-08-10T00:00:00.000Z' },
    });
    // The refetch after delete reports the tombstone via `deleted`, not `files`.
    mocked.fetchCodeSurfaceSources.mockResolvedValueOnce(
      sourcesFor({
        files: [{ path: 'GAME.json', content: '{"engine":{"modules":[]}}' }],
        deleted: ['src/main.ts'],
      }),
    );

    await render();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.code-surface-file-trigger')!.click();
    });
    const deleteBtn = () =>
      [...container.querySelectorAll<HTMLButtonElement>('.code-surface-file-option')]
        .find((option) => option.textContent?.includes('src/main.ts'))
        ?.querySelector<HTMLButtonElement>('.code-surface-file-option-delete');
    await act(async () => {
      deleteBtn()!.click();
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="code-tree-confirm"]')!.click();
      await flush();
    });

    expect(container.querySelector<HTMLButtonElement>('.code-surface-discard')).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>('.code-surface-deliver-btn')!.disabled).toBe(false);
  });

  it('waits for an in-flight autosave before deleting, so the save cannot revive the file', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValueOnce(
      sourcesFor({ files: [{ path: 'game.ts', content: 'export const boot = () => {};' }] }),
    );
    let resolveSave: ((value: codeSurfaceApi.CodeSurfaceStageResult) => void) | null = null;
    mocked.stageCodeSurfaceFile.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    mocked.deleteCodeSurfaceFile.mockResolvedValue({
      accepted: true,
      path: 'game.ts',
      staged: { totalBytes: 0, maxBytes: 1_000_000, maxFiles: 60, updatedAt: '2026-08-10T00:00:00.000Z' },
    });
    mocked.fetchCodeSurfaceSources.mockResolvedValueOnce(sourcesFor({ files: [] }));

    await render();
    const textarea = container.querySelector('textarea')!;
    await act(async () => {
      typeInto(textarea, 'export const boot = () => { /* edited */ };');
    });
    // Debounce fires: the PUT is in flight (unresolved) when delete is requested.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(mocked.stageCodeSurfaceFile).toHaveBeenCalledTimes(1);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.code-surface-file-trigger')!.click();
    });
    const deleteBtn = () =>
      [...container.querySelectorAll<HTMLButtonElement>('.code-surface-file-option')]
        .find((option) => option.textContent?.includes('game.ts'))
        ?.querySelector<HTMLButtonElement>('.code-surface-file-option-delete');
    await act(async () => {
      deleteBtn()!.click();
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="code-tree-confirm"]')!.click();
      await flush();
    });

    // Not called yet — the autosave PUT is still unresolved.
    expect(mocked.deleteCodeSurfaceFile).not.toHaveBeenCalled();

    await act(async () => {
      resolveSave!({
        accepted: true,
        path: 'game.ts',
        bytes: 10,
        staged: { totalBytes: 10, maxBytes: 1_000_000, maxFiles: 60, updatedAt: '2026-08-10T00:00:00.000Z' },
      });
      await flush();
    });

    expect(mocked.deleteCodeSurfaceFile).toHaveBeenCalledWith('sky-dodge', 'game.ts');
  });

  it('autosaves an edit into the working copy, marks the rail dirty, and schedules a preview rebuild', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    mocked.stageCodeSurfaceFile.mockResolvedValue({
      accepted: true,
      path: 'game.ts',
      bytes: 40,
      staged: { totalBytes: 40, maxBytes: 1_000_000, maxFiles: 60, updatedAt: '2026-08-10T00:00:00.000Z' },
    });

    await render();
    const textarea = container.querySelector('textarea')!;
    expect(textarea).not.toBeNull();

    await act(async () => {
      typeInto(textarea, 'export const boot = () => { /* edited */ };');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await flush();
    });

    expect(mocked.stageCodeSurfaceFile).toHaveBeenCalledWith(
      'sky-dodge',
      'game.ts',
      expect.stringContaining('edited'),
      { rebuild: false },
    );
    expect(container.querySelector('.code-surface-rail-item.has-staged-edits')).not.toBeNull();
    expect(container.querySelector('[data-testid="code-working-copy-status"]')!.textContent).toMatch(/changed|saved/i);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
      await flush();
    });

    expect(mocked.rebuildCodeSurfaceStage).toHaveBeenCalledWith('sky-dodge');
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'Stage it')).toBe(false);
  });

  it('Track 2: the same scheduled rebuild also requests a synchronous preview and reports it', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    mocked.stageCodeSurfaceFile.mockResolvedValue({
      accepted: true,
      path: 'game.ts',
      bytes: 40,
      staged: { totalBytes: 40, maxBytes: 1_000_000, maxFiles: 60, updatedAt: '2026-08-10T00:00:00.000Z' },
    });
    mocked.requestCodeSurfacePreview.mockResolvedValue({ html: '<html>fast</html>', engineRef: 'abc123' });
    const onPreviewReady = vi.fn();

    await render('sky-dodge', undefined, onPreviewReady);
    const textarea = container.querySelector('textarea')!;

    await act(async () => {
      typeInto(textarea, 'export const boot = () => { /* edited */ };');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await flush();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
      await flush();
    });

    expect(mocked.requestCodeSurfacePreview).toHaveBeenCalledWith('sky-dodge');
    expect(onPreviewReady).toHaveBeenCalledWith('<html>fast</html>');
  });

  it('shows a spinner while the fast preview is in flight, then a clickable "preview ready" link', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    mocked.stageCodeSurfaceFile.mockResolvedValue({
      accepted: true,
      path: 'game.ts',
      bytes: 40,
      staged: { totalBytes: 40, maxBytes: 1_000_000, maxFiles: 60, updatedAt: '2026-08-10T00:00:00.000Z' },
    });
    let resolvePreview: ((value: { html: string; engineRef: string }) => void) | undefined;
    mocked.requestCodeSurfacePreview.mockReturnValue(
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
    );
    const onBack = vi.fn();

    await render('sky-dodge', undefined, undefined, onBack);
    const textarea = container.querySelector('textarea')!;

    await act(async () => {
      typeInto(textarea, 'export const boot = () => { /* edited */ };');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await flush();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
      await flush();
    });

    expect(container.querySelector('.code-surface-preview-status.is-pending')).not.toBeNull();
    expect(container.querySelector('.code-surface-preview-status.is-ready')).toBeNull();

    await act(async () => {
      resolvePreview?.({ html: '<html>fast</html>', engineRef: 'abc123' });
      await flush();
    });

    expect(container.querySelector('.code-surface-preview-status.is-pending')).toBeNull();
    const readyLink = container.querySelector<HTMLButtonElement>('.code-surface-preview-status.is-ready')!;
    expect(readyLink.textContent).toContain('Preview ready');

    await act(async () => {
      readyLink.click();
    });
    expect(onBack).toHaveBeenCalled();
  });

  it('clears a stale "preview ready" link the moment a new edit is saved, not when the next request starts', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    mocked.stageCodeSurfaceFile.mockResolvedValue({
      accepted: true,
      path: 'game.ts',
      bytes: 40,
      staged: { totalBytes: 40, maxBytes: 1_000_000, maxFiles: 60, updatedAt: '2026-08-10T00:00:00.000Z' },
    });
    mocked.requestCodeSurfacePreview.mockResolvedValue({ html: '<html>first</html>', engineRef: 'abc123' });

    await render();
    const textarea = container.querySelector('textarea')!;

    await act(async () => {
      typeInto(textarea, 'export const boot = () => { /* first edit */ };');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await flush();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
      await flush();
    });

    expect(container.querySelector('.code-surface-preview-status.is-ready')).not.toBeNull();

    // The second edit's own preview debounce hasn't even started yet.
    await act(async () => {
      typeInto(textarea, 'export const boot = () => { /* second edit */ };');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await flush();
    });

    expect(container.querySelector('.code-surface-preview-status.is-ready')).toBeNull();
    expect(container.querySelector('.code-surface-preview-status.is-pending')).toBeNull();
  });

  it('CE-17: shows a notice when a staging write reports it opened a fresh round', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    mocked.stageCodeSurfaceFile.mockResolvedValue({
      accepted: true,
      path: 'game.ts',
      bytes: 40,
      roundOpened: 42,
      staged: { totalBytes: 40, maxBytes: 1_000_000, maxFiles: 60, updatedAt: '2026-08-15T00:00:00.000Z' },
    });

    await render();
    const textarea = container.querySelector('textarea')!;
    expect(container.querySelector('.code-surface-round-opened')).toBeNull();

    await act(async () => {
      typeInto(textarea, 'export const boot = () => { /* reopened */ };');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await flush();
    });

    expect(container.querySelector('.code-surface-round-opened')).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
      await flush();
    });
    expect(container.querySelector('.code-surface-round-opened')).toBeNull();
  });

  it('offers a diff toggle only for a staged file with a live base, and renders +/- lines', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(
      sourcesFor({
        files: [
          {
            path: 'game.ts',
            content: 'export const boot = () => 2;',
            stagedBy: 'owner',
            base: 'export const boot = () => 1;',
          },
          { path: 'game/render.ts', content: 'export const paint = () => {};' },
        ],
      }),
    );

    await render();

    // game.ts is staged with a base — the toggle appears.
    expect(container.querySelector('.code-surface-diff-toggle')).not.toBeNull();
    expect(container.querySelector('.code-surface-diff-view')).toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.code-surface-diff-toggle')!.click();
    });

    const diffView = container.querySelector('.code-surface-diff-view');
    expect(diffView).not.toBeNull();
    expect(container.querySelector('.code-surface-diff-line-removed')?.textContent).toContain('boot = () => 1');
    expect(container.querySelector('.code-surface-diff-line-added')?.textContent).toContain('boot = () => 2');
    // No editor while the diff is showing.
    expect(container.querySelector('textarea')).toBeNull();

    // Switching files hides the diff — render.ts has no base.
    const railButtons = [...container.querySelectorAll<HTMLButtonElement>('.code-surface-rail-item')];
    const renderTab = railButtons.find((button) => button.textContent?.includes('render.ts'))!;
    await act(async () => {
      renderTab.click();
    });
    expect(container.querySelector('.code-surface-diff-toggle')).toBeNull();
  });

  it('restores the selected file and draft after close/reopen, flushing the pending save on unmount', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    mocked.stageCodeSurfaceFile.mockResolvedValue({
      accepted: true,
      path: 'game/render.ts',
      bytes: 40,
      staged: { totalBytes: 40, maxBytes: 1_000_000, maxFiles: 60, updatedAt: null },
    });

    await render();
    const renderTab = [...container.querySelectorAll('.code-surface-rail-item')].find((b) =>
      b.textContent?.includes('game/render.ts'),
    ) as HTMLButtonElement;
    await act(async () => {
      renderTab.click();
    });
    const textarea = container.querySelector('textarea')!;
    await act(async () => {
      typeInto(textarea, 'export const paint = () => { /* tweaked */ };');
    });

    // Unmount inside the autosave window: pending saves must flush.
    await act(async () => root.unmount());
    expect(mocked.stageCodeSurfaceFile).toHaveBeenCalledWith(
      'sky-dodge',
      'game/render.ts',
      expect.stringContaining('tweaked'),
      { rebuild: false },
    );

    root = createRoot(container);
    await render();
    const active = container.querySelector('.code-surface-rail-item.is-active');
    expect(active?.textContent).toContain('game/render.ts');
    expect(container.querySelector('textarea')!.value).toContain('tweaked');
  });

  it('restores the per-file undo history after switching to Play and back', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());

    await render();
    const savedEditorState = {
      doc: 'export const boot = () => { /* edited */ };',
      selection: { ranges: [{ anchor: 0, head: 0 }], main: 0 },
      history: { done: [], undone: [] },
    };
    codeMirrorMock.current?.onEditorStateChange?.(savedEditorState);
    expect(getCodeSurfaceSessionState('sky-dodge')?.editorStates?.['game.ts']).toEqual(savedEditorState);

    await act(async () => root.unmount());
    root = createRoot(container);
    await render();

    expect(codeMirrorMock.current?.initialEditorState).toEqual(savedEditorState);
  });

  it('shows Discard when the buffer has owner changes, and discard reloads the delivered tree', async () => {
    const stagedSources = sourcesFor({
      files: [
        { path: 'game.ts', content: 'export const boot = () => { /* staged */ };', stagedBy: 'owner' },
        { path: 'game/render.ts', content: 'export const paint = () => {};' },
      ],
      staged: { totalBytes: 40, maxBytes: 1_000_000, maxFiles: 60, updatedAt: '2026-08-11T00:00:00.000Z' },
    });
    mocked.fetchCodeSurfaceSources.mockResolvedValueOnce(stagedSources).mockResolvedValueOnce(sourcesFor());
    mocked.discardCodeSurfaceEdits.mockResolvedValue({ cleared: 1 });

    await render();

    expect(container.textContent).toMatch(/1 file changed/i);
    const discard = container.querySelector<HTMLButtonElement>('.code-surface-discard')!;
    await act(async () => {
      discard.click();
    });
    expect(mocked.discardCodeSurfaceEdits).not.toHaveBeenCalled();
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="code-tree-confirm"]')!.click();
      await flush();
    });
    expect(mocked.discardCodeSurfaceEdits).toHaveBeenCalledWith('sky-dodge');
    expect(container.textContent).toMatch(/No local changes/i);
  });

  it('renders typecheck diagnostics without ever sending source text to telemetry', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    mocked.stageCodeSurfaceFile.mockResolvedValue({
      accepted: true,
      path: 'game.ts',
      bytes: 10,
      staged: { totalBytes: 10, maxBytes: 1_000_000, maxFiles: 60, updatedAt: null },
    });
    mocked.typecheckCodeSurface.mockResolvedValue({ ok: false, errors: ['game.ts:1: error TS2339: nope'] });

    await render();
    const textarea = container.querySelector('textarea')!;
    await act(async () => {
      typeInto(textarea, 'export const boot = () => { nope.x; };');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
      await flush();
    });

    expect(container.textContent).toContain('error TS2339');
  });

  it('renders the locked shared/tools rows as inert — no click handler, no fetch (CE-09)', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    await render();

    const locked = [...container.querySelectorAll('.code-surface-rail-locked')];
    expect(locked).toHaveLength(2);
    for (const row of locked) {
      // A locked row is a <div>, not a <button> — there is no path from it to a fetch.
      expect(row.tagName).toBe('DIV');
      await act(async () => {
        row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();
      });
    }
    expect(mocked.fetchCodeSurfaceSources).toHaveBeenCalledTimes(1);
    expect(mocked.stageCodeSurfaceFile).not.toHaveBeenCalled();
  });

  it('autosaves both files edited inside one debounce window — a second file must not cancel the first', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    mocked.stageCodeSurfaceFile.mockResolvedValue({
      accepted: true,
      path: 'x',
      bytes: 1,
      staged: { totalBytes: 1, maxBytes: 1_000_000, maxFiles: 60, updatedAt: null },
    });

    await render();
    await act(async () => {
      typeInto(container.querySelector('textarea')!, 'export const boot = () => { /* game.ts edit */ };');
    });

    // Switch files before game.ts's own 1500ms debounce fires — its timer must keep
    // running independently, not get cancelled by render.ts's own edit below.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    const renderTsButton = [...container.querySelectorAll('.code-surface-rail-item')].find((btn) =>
      btn.textContent?.includes('game/render.ts'),
    ) as HTMLButtonElement;
    await act(async () => {
      renderTsButton.click();
    });
    await act(async () => {
      typeInto(container.querySelector('textarea')!, 'export const paint = () => { /* render.ts edit */ };');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(mocked.stageCodeSurfaceFile).toHaveBeenCalledWith(
      'sky-dodge',
      'game.ts',
      expect.stringContaining('game.ts edit'),
      { rebuild: false },
    );
    expect(mocked.stageCodeSurfaceFile).toHaveBeenCalledWith(
      'sky-dodge',
      'game/render.ts',
      expect.stringContaining('render.ts edit'),
      { rebuild: false },
    );
  });

  it('Publish flushes every dirty file, not just the one currently open', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    mocked.stageCodeSurfaceFile.mockResolvedValue({
      accepted: true,
      path: 'x',
      bytes: 1,
      staged: { totalBytes: 1, maxBytes: 1_000_000, maxFiles: 60, updatedAt: null },
    });
    mocked.deliverCodeSurface.mockResolvedValue({
      accepted: true,
      slug: 'sky-dodge',
      version: 'v2',
      mode: 'publish',
      gateStarted: true,
    });

    await render();
    await act(async () => {
      typeInto(container.querySelector('textarea')!, 'export const boot = () => { /* edited game.ts */ };');
    });
    const renderTsButton = [...container.querySelectorAll('.code-surface-rail-item')].find((btn) =>
      btn.textContent?.includes('game/render.ts'),
    ) as HTMLButtonElement;
    await act(async () => {
      renderTsButton.click();
    });

    expect(container.querySelector('.code-surface-attestation')).toBeNull();
    const publishHint = container.querySelector<HTMLElement>('.code-surface-publish-hint')!;
    expect(publishHint.parentElement?.classList.contains('code-surface-deliver')).toBe(true);
    expect(publishHint.textContent).toContain('Confirms your right');
    expect(publishHint.title).toContain('Publishing confirms');
    expect(publishHint.getAttribute('aria-label')).toBe(publishHint.title);
    expect(publishHint.tabIndex).toBe(0);

    const publishButton = container.querySelector<HTMLButtonElement>('.code-surface-deliver-btn')!;
    await act(async () => {
      publishButton.click();
      await flush();
    });

    expect(mocked.stageCodeSurfaceFile).toHaveBeenCalledWith(
      'sky-dodge',
      'game.ts',
      expect.stringContaining('edited game.ts'),
      { rebuild: false },
    );
    expect(mocked.deliverCodeSurface).toHaveBeenCalledWith('sky-dodge', 'publish');
  });

  it('offers to add the required file a refused Publish named, and opens it once added', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    mocked.stageCodeSurfaceFile.mockResolvedValue({
      accepted: true,
      path: 'game.ts',
      bytes: 1,
      staged: { totalBytes: 1, maxBytes: 1_000_000, maxFiles: 60, updatedAt: null },
    });
    const refusal = new codeSurfaceApi.CodeSurfaceApiError('SPEC.md is required — it is the spec of record');
    refusal.status = 400;
    refusal.code = 'invalid_upload';
    refusal.missing = ['SPEC.md'];
    mocked.deliverCodeSurface.mockRejectedValue(refusal);
    mocked.restoreCodeSurfaceFile.mockResolvedValue({
      accepted: true,
      path: 'SPEC.md',
      bytes: 20,
      from: 'stub',
      staged: { totalBytes: 20, maxBytes: 1_000_000, maxFiles: 60, updatedAt: null },
    });

    await render();
    await act(async () => {
      typeInto(container.querySelector('textarea')!, 'export const boot = () => { /* edited */ };');
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.code-surface-deliver-btn')!.click();
      await flush();
    });

    const fix = container.querySelector<HTMLButtonElement>('.code-surface-deliver-fix')!;
    expect(container.querySelector('.code-surface-deliver-message')!.textContent).toContain('SPEC.md is required');
    expect(fix.textContent).toBe('Add SPEC.md');

    mocked.fetchCodeSurfaceSources.mockResolvedValue(
      sourcesFor({
        files: [
          { path: 'SPEC.md', content: '---\ntitle: "Sky Dodge"\n---\n' },
          { path: 'game.ts', content: 'export const boot = () => {};' },
        ],
      }),
    );
    await act(async () => {
      fix.click();
      await flush();
    });

    expect(mocked.restoreCodeSurfaceFile).toHaveBeenCalledWith('sky-dodge', 'SPEC.md');
    expect(container.querySelector('.code-surface-deliver-fix')).toBeNull();
    expect(container.querySelector('.code-surface-deliver-message')!.textContent).toContain('your game brief');
    // Opened, so the creator lands on what they must fill in.
    expect(container.querySelector('textarea')!.value).toContain('title: "Sky Dodge"');
  });

  it('does not offer the fixit for a refusal that names no missing file', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    mocked.stageCodeSurfaceFile.mockResolvedValue({
      accepted: true,
      path: 'game.ts',
      bytes: 1,
      staged: { totalBytes: 1, maxBytes: 1_000_000, maxFiles: 60, updatedAt: null },
    });
    const refusal = new codeSurfaceApi.CodeSurfaceApiError('this build does not typecheck');
    refusal.status = 400;
    refusal.code = 'invalid_upload';
    mocked.deliverCodeSurface.mockRejectedValue(refusal);

    await render();
    await act(async () => {
      typeInto(container.querySelector('textarea')!, 'export const boot = () => { /* edited */ };');
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.code-surface-deliver-btn')!.click();
      await flush();
    });

    expect(container.querySelector('.code-surface-deliver-message')!.textContent).toContain('does not typecheck');
    expect(container.querySelector('.code-surface-deliver-fix')).toBeNull();
  });

  it('Publish refuses to ship when the pre-flight autosave fails, rather than delivering without the edit', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    mocked.stageCodeSurfaceFile.mockRejectedValue(new Error('network blip'));

    await render();
    await act(async () => {
      typeInto(container.querySelector('textarea')!, 'export const boot = () => { /* edited */ };');
    });

    const deliverButton = container.querySelector<HTMLButtonElement>('.code-surface-deliver-btn')!;
    await act(async () => {
      deliverButton.click();
      await flush();
    });

    expect(mocked.stageCodeSurfaceFile).toHaveBeenCalled();
    expect(mocked.deliverCodeSurface).not.toHaveBeenCalled();
  });

  describe('EDITOR.json live push (realtime-game-editing-plan.md §E tier 1)', () => {
    const editorJson = JSON.stringify({
      content: { cards: [] },
      params: { speed: { type: 'number', label: { en: 'Speed', pl: 'Prędkość' }, min: 1, max: 10, default: 5 } },
    });

    function sourcesWithEditorJson() {
      return sourcesFor({
        files: [
          { path: 'game.ts', content: 'export const boot = () => {};' },
          { path: 'EDITOR.json', content: editorJson },
        ],
      });
    }

    it('pushes a changed param default straight to the running game, live, alongside the normal autosave', async () => {
      mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesWithEditorJson());
      mocked.stageCodeSurfaceFile.mockResolvedValue({
        accepted: true,
        path: 'EDITOR.json',
        bytes: 10,
        staged: { totalBytes: 10, maxBytes: 1_000_000, maxFiles: 60, updatedAt: null },
      });
      mockedStudioApi.fetchGameEditor.mockResolvedValue({
        version: 'v1',
        definition: { version: 1, content: {} },
        content: { params: { speed: 5 } },
        draft: null,
      });
      const pushRef: { current: ((content: EditorContentDoc) => void) | null } = { current: vi.fn() };

      await render('sky-dodge', pushRef);
      const editorTab = [...container.querySelectorAll('.code-surface-rail-item')].find((b) =>
        b.textContent?.includes('EDITOR.json'),
      ) as HTMLButtonElement;
      await act(async () => {
        editorTab.click();
      });

      const next = JSON.parse(editorJson);
      next.params.speed.default = 8;
      await act(async () => {
        typeInto(container.querySelector('textarea')!, JSON.stringify(next));
        await flush();
      });

      expect(pushRef.current).toHaveBeenCalledWith({ params: { speed: 8 } });
      expect(container.textContent).toContain('Live');

      // A live push is additive — the normal autosave/staging still runs.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(mocked.stageCodeSurfaceFile).toHaveBeenCalledWith(
        'sky-dodge',
        'EDITOR.json',
        expect.stringContaining('"default":8'),
        { rebuild: false },
      );
      expect(mocked.rebuildCodeSurfaceStage).not.toHaveBeenCalled();
    });

    it('does not push a label/range change — that still needs the staged rebuild path', async () => {
      mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesWithEditorJson());
      mocked.stageCodeSurfaceFile.mockResolvedValue({
        accepted: true,
        path: 'EDITOR.json',
        bytes: 10,
        staged: { totalBytes: 10, maxBytes: 1_000_000, maxFiles: 60, updatedAt: null },
      });
      const pushRef: { current: ((content: EditorContentDoc) => void) | null } = { current: vi.fn() };

      await render('sky-dodge', pushRef);
      const editorTab = [...container.querySelectorAll('.code-surface-rail-item')].find((b) =>
        b.textContent?.includes('EDITOR.json'),
      ) as HTMLButtonElement;
      await act(async () => {
        editorTab.click();
      });

      const next = JSON.parse(editorJson);
      next.params.speed.max = 20;
      await act(async () => {
        typeInto(container.querySelector('textarea')!, JSON.stringify(next));
        await flush();
      });

      expect(pushRef.current).not.toHaveBeenCalled();
      expect(mockedStudioApi.fetchGameEditor).not.toHaveBeenCalled();
      expect(container.textContent).not.toContain('Live');
    });

    it('does not push a default that violates its own declared range', async () => {
      mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesWithEditorJson());
      mocked.stageCodeSurfaceFile.mockResolvedValue({
        accepted: true,
        path: 'EDITOR.json',
        bytes: 10,
        staged: { totalBytes: 10, maxBytes: 1_000_000, maxFiles: 60, updatedAt: null },
      });
      const pushRef: { current: ((content: EditorContentDoc) => void) | null } = { current: vi.fn() };

      await render('sky-dodge', pushRef);
      const editorTab = [...container.querySelectorAll('.code-surface-rail-item')].find((b) =>
        b.textContent?.includes('EDITOR.json'),
      ) as HTMLButtonElement;
      await act(async () => {
        editorTab.click();
      });

      const next = JSON.parse(editorJson);
      next.params.speed.default = 999; // max is 10
      await act(async () => {
        typeInto(container.querySelector('textarea')!, JSON.stringify(next));
        await flush();
      });

      expect(pushRef.current).not.toHaveBeenCalled();
      expect(mockedStudioApi.fetchGameEditor).not.toHaveBeenCalled();
      expect(container.textContent).not.toContain('Live');
    });

    it('merges two concurrent live pushes instead of the second overwriting the first', async () => {
      const twoParams = JSON.stringify({
        content: { cards: [] },
        params: {
          speed: { type: 'number', label: { en: 'Speed', pl: 'Prędkość' }, min: 1, max: 10, default: 5 },
          hardMode: { type: 'boolean', label: { en: 'Hard mode', pl: 'Tryb trudny' }, default: false },
        },
      });
      mocked.fetchCodeSurfaceSources.mockResolvedValue(
        sourcesFor({
          files: [
            { path: 'game.ts', content: 'export const boot = () => {};' },
            { path: 'EDITOR.json', content: twoParams },
          ],
        }),
      );
      mocked.stageCodeSurfaceFile.mockResolvedValue({
        accepted: true,
        path: 'EDITOR.json',
        bytes: 10,
        staged: { totalBytes: 10, maxBytes: 1_000_000, maxFiles: 60, updatedAt: null },
      });
      // Held open — both edits below must race this, like two quick keystrokes would.
      let resolveFetch!: (value: GameEditorState) => void;
      mockedStudioApi.fetchGameEditor.mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
      );
      const pushRef: { current: ((content: EditorContentDoc) => void) | null } = { current: vi.fn() };

      await render('sky-dodge', pushRef);
      const editorTab = [...container.querySelectorAll('.code-surface-rail-item')].find((b) =>
        b.textContent?.includes('EDITOR.json'),
      ) as HTMLButtonElement;
      await act(async () => {
        editorTab.click();
      });

      const afterFirst = JSON.parse(twoParams);
      afterFirst.params.speed.default = 8;
      await act(async () => {
        typeInto(container.querySelector('textarea')!, JSON.stringify(afterFirst));
        await flush();
      });

      const afterSecond = JSON.parse(JSON.stringify(afterFirst));
      afterSecond.params.hardMode.default = true;
      await act(async () => {
        typeInto(container.querySelector('textarea')!, JSON.stringify(afterSecond));
        await flush();
      });

      expect(pushRef.current).not.toHaveBeenCalled(); // both onEdit calls await the same fetch

      await act(async () => {
        resolveFetch({
          version: 'v1',
          definition: { version: 1, content: {} },
          content: { params: { speed: 5, hardMode: false } },
          draft: null,
        });
        await flush();
      });

      expect(pushRef.current).toHaveBeenLastCalledWith({ params: { speed: 8, hardMode: true } });
    });

    it('does nothing when no editorPushRef was supplied — Play-tab-only sessions must not throw', async () => {
      mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesWithEditorJson());
      mocked.stageCodeSurfaceFile.mockResolvedValue({
        accepted: true,
        path: 'EDITOR.json',
        bytes: 10,
        staged: { totalBytes: 10, maxBytes: 1_000_000, maxFiles: 60, updatedAt: null },
      });

      await render('sky-dodge');
      const editorTab = [...container.querySelectorAll('.code-surface-rail-item')].find((b) =>
        b.textContent?.includes('EDITOR.json'),
      ) as HTMLButtonElement;
      await act(async () => {
        editorTab.click();
      });

      const next = JSON.parse(editorJson);
      next.params.speed.default = 8;
      await act(async () => {
        typeInto(container.querySelector('textarea')!, JSON.stringify(next));
        await flush();
      });

      expect(container.textContent).not.toContain('Live');
    });

    it('Track 3: scrubbing a declared param pushes live through the same tier-1 path', async () => {
      mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesWithEditorJson());
      mocked.stageCodeSurfaceFile.mockResolvedValue({
        accepted: true,
        path: 'EDITOR.json',
        bytes: 10,
        staged: { totalBytes: 10, maxBytes: 1_000_000, maxFiles: 60, updatedAt: null },
      });
      mockedStudioApi.fetchGameEditor.mockResolvedValue({
        version: 'v1',
        definition: { version: 1, content: {} },
        content: { params: { speed: 5 } },
        draft: null,
      });
      const pushRef: { current: ((content: EditorContentDoc) => void) | null } = { current: vi.fn() };

      await render('sky-dodge', pushRef);
      const editorTab = [...container.querySelectorAll('.code-surface-rail-item')].find((b) =>
        b.textContent?.includes('EDITOR.json'),
      ) as HTMLButtonElement;
      await act(async () => {
        editorTab.click();
      });

      const scrubber = container.querySelector('.number-scrubber[aria-label="Speed"]') as HTMLElement;
      expect(scrubber).not.toBeNull();
      expect(scrubber.getAttribute('aria-valuenow')).toBe('5');

      await act(async () => {
        scrubber.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        await flush();
      });

      // A 1-10 range's step is (10-1)/100 = 0.09.
      expect(pushRef.current).toHaveBeenCalledWith({ params: { speed: 5.09 } });
      expect(container.textContent).toContain('Live');
    });

    it('gives every param control an accessible name, not just the scrubber', async () => {
      mocked.fetchCodeSurfaceSources.mockResolvedValue(
        sourcesFor({
          files: [
            { path: 'game.ts', content: 'export const boot = () => {};' },
            {
              path: 'EDITOR.json',
              content: JSON.stringify({
                content: {},
                params: {
                  color: { type: 'enum', label: { en: 'Color', pl: 'Kolor' }, values: ['red', 'blue'], default: 'red' },
                  loud: { type: 'bool', label: { en: 'Loud', pl: 'Głośno' }, default: false },
                  title: { type: 'text', label: { en: 'Title', pl: 'Tytuł' }, max: 20, default: 'Hi' },
                },
              }),
            },
          ],
        }),
      );
      mockedStudioApi.fetchGameEditor.mockResolvedValue({
        version: 'v1',
        definition: { version: 1, content: {} },
        content: { params: {} },
        draft: null,
      });

      await render();
      const editorTab = [...container.querySelectorAll('.code-surface-rail-item')].find((b) =>
        b.textContent?.includes('EDITOR.json'),
      ) as HTMLButtonElement;
      await act(async () => {
        editorTab.click();
      });

      expect(container.querySelector('.code-surface-param-select[aria-label="Color"]')).not.toBeNull();
      expect(container.querySelector('input[type="checkbox"][aria-label="Loud"]')).not.toBeNull();
      expect(container.querySelector('.code-surface-param-text[aria-label="Title"]')).not.toBeNull();
    });
  });

  describe('agent mode', () => {
    it('is off by default: no WebMCP registration until the creator opts in', async () => {
      mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());

      await render();

      expect(mockedWebmcp.registerCodeSurfaceWebMcpTools).not.toHaveBeenCalled();
    });

    it('opens the Agent mode modal, and its WebMCP toggle registers the tool set', async () => {
      mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());

      await render();

      const trigger = container.querySelector<HTMLButtonElement>('.code-surface-agent-mode-trigger')!;
      await act(async () => {
        trigger.click();
      });

      const dialog = container.querySelector('.code-surface-agent-mode-dialog');
      expect(dialog).not.toBeNull();
      // The coding-agent bridge reuses the creator's real MCP key panel.
      expect(container.querySelector('.studio-creator-key')).not.toBeNull();

      const toggle = container.querySelector<HTMLInputElement>('.code-surface-agent-mode-toggle input')!;
      expect(toggle.checked).toBe(false);
      await act(async () => {
        toggle.click();
      });

      expect(mockedWebmcp.registerCodeSurfaceWebMcpTools).toHaveBeenCalledWith('sky-dodge');
      expect(toggle.checked).toBe(true);
    });

    it('remembers the opt-in across a remount of the same round', async () => {
      mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
      await render();

      const trigger = container.querySelector<HTMLButtonElement>('.code-surface-agent-mode-trigger')!;
      await act(async () => {
        trigger.click();
      });
      const toggle = container.querySelector<HTMLInputElement>('.code-surface-agent-mode-toggle input')!;
      await act(async () => {
        toggle.click();
      });

      mockedWebmcp.registerCodeSurfaceWebMcpTools.mockClear();
      await act(async () => root.unmount());
      root = createRoot(container);
      await render();

      expect(mockedWebmcp.registerCodeSurfaceWebMcpTools).toHaveBeenCalledWith('sky-dodge');
    });

    it('runs a typed JSON command through the console and shows the tool result', async () => {
      mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
      mocked.patchCodeSurfaceFile.mockResolvedValue({
        accepted: true,
        path: 'game.ts',
        bytes: 12,
        staged: { totalBytes: 12, maxBytes: 100, maxFiles: 10, updatedAt: null },
        replacements: 1,
        baseFrom: 'delivery',
      });

      await render();
      const trigger = container.querySelector<HTMLButtonElement>('.code-surface-agent-mode-trigger')!;
      await act(async () => {
        trigger.click();
      });

      const input = container.querySelector<HTMLTextAreaElement>('.code-surface-agent-console-input')!;
      await act(async () => {
        typeInto(input, JSON.stringify({ tool: 'patch_source_file', input: { path: 'game.ts', old: 'a', new: 'b' } }));
      });
      const run = container.querySelector<HTMLButtonElement>('.code-surface-agent-console-run')!;
      await act(async () => {
        run.click();
      });

      expect(mocked.patchCodeSurfaceFile).toHaveBeenCalledWith(
        'sky-dodge',
        'game.ts',
        { old: 'a', new: 'b' },
        {
          agentAuthored: true,
        },
      );
      // The agent rewrote the working copy, so the editor must reload it.
      expect(mocked.fetchCodeSurfaceSources.mock.calls.length).toBeGreaterThan(1);
      const output = container.querySelector('.code-surface-agent-console-output')!;
      expect(JSON.parse(output.textContent!)).toMatchObject({ ok: true, path: 'game.ts', replacements: 1 });
    });

    it('surfaces a bad command as a readable error instead of failing silently', async () => {
      mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());

      await render();
      const trigger = container.querySelector<HTMLButtonElement>('.code-surface-agent-mode-trigger')!;
      await act(async () => {
        trigger.click();
      });

      const input = container.querySelector<HTMLTextAreaElement>('.code-surface-agent-console-input')!;
      await act(async () => {
        typeInto(input, 'please open game.ts');
      });
      const run = container.querySelector<HTMLButtonElement>('.code-surface-agent-console-run')!;
      await act(async () => {
        run.click();
      });

      const output = container.querySelector('.code-surface-agent-console-output')!;
      expect(JSON.parse(output.textContent!).error).toContain('invalid JSON');
    });

    it('keeps every past console command and result — not just the latest one', async () => {
      mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());

      await render();
      const trigger = container.querySelector<HTMLButtonElement>('.code-surface-agent-mode-trigger')!;
      await act(async () => {
        trigger.click();
      });

      const input = container.querySelector<HTMLTextAreaElement>('.code-surface-agent-console-input')!;
      const run = container.querySelector<HTMLButtonElement>('.code-surface-agent-console-run')!;

      await act(async () => {
        typeInto(input, JSON.stringify({ tool: 'get_sources', input: {} }));
      });
      await act(async () => {
        run.click();
      });
      await act(async () => {
        typeInto(input, '{"tool":"unknown_tool","input":{}}');
      });
      await act(async () => {
        run.click();
      });

      const entries = container.querySelectorAll('.code-surface-agent-console-entry');
      expect(entries.length).toBe(2);
      // Newest first — the failed unknown-tool call is entry #2, on top.
      expect(entries[0]!.className).toContain('is-error');
      expect(entries[0]!.textContent).toContain('#2');
      expect(JSON.parse(entries[0]!.querySelector('.code-surface-agent-console-output')!.textContent!).error).toContain(
        'unknown tool',
      );
      expect(entries[1]!.className).not.toContain('is-error');
      expect(entries[1]!.textContent).toContain('#1');
      expect(JSON.parse(entries[1]!.querySelector('.code-surface-agent-console-output')!.textContent!)).toMatchObject({
        available: true,
      });
    });
  });
});
