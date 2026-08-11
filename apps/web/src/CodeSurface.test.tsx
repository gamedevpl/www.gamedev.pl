// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeSurface } from './CodeSurface.js';
import { resetCodeSurfaceSessionState } from './codeSurfaceSessionState.js';
import * as codeSurfaceApi from './codeSurfaceApi.js';
import i18n from './i18n/index.js';

// The real CodeMirror editor needs DOM layout measurement jsdom cannot provide, and
// its dynamic import races the plain-textarea Suspense fallback these tests rely on —
// a stand-in with the same value/onChange contract keeps that race out of the picture.
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
    expect(container.textContent).toContain('export const boot');
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
    const discard = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Discard changes')!;
    expect(discard).not.toBeUndefined();

    await act(async () => {
      discard.click();
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

    const attestCheckbox = container.querySelector<HTMLInputElement>('.code-surface-attestation input')!;
    await act(async () => {
      attestCheckbox.click();
    });
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

  it('Publish refuses to ship when the pre-flight autosave fails, rather than delivering without the edit', async () => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sourcesFor());
    mocked.stageCodeSurfaceFile.mockRejectedValue(new Error('network blip'));

    await render();
    await act(async () => {
      typeInto(container.querySelector('textarea')!, 'export const boot = () => { /* edited */ };');
    });

    const attestCheckbox = container.querySelector<HTMLInputElement>('.code-surface-attestation input')!;
    await act(async () => {
      attestCheckbox.click();
    });
    const deliverButton = container.querySelector<HTMLButtonElement>('.code-surface-deliver-btn')!;
    await act(async () => {
      deliverButton.click();
      await flush();
    });

    expect(mocked.stageCodeSurfaceFile).toHaveBeenCalled();
    expect(mocked.deliverCodeSurface).not.toHaveBeenCalled();
  });
});
