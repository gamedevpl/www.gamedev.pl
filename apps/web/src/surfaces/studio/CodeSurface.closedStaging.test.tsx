// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CodeSurface } from './CodeSurface.js';
import * as api from './codeSurfaceApi.js';
import { resetCodeSurfaceSessionState } from './codeSurfaceSessionState.js';
import i18n from '../../i18n/index.js';

vi.mock('./CodeMirrorEditor.js', () => ({
  default: ({ value }: { value: string }) => createElement('textarea', { value, readOnly: true }),
}));
vi.mock('./codeSurfaceApi.js', async () => ({
  ...(await vi.importActual<typeof api>('./codeSurfaceApi.js')),
  fetchCodeSurfaceSources: vi.fn(),
  discardCodeSurfaceEdits: vi.fn(),
  rebuildCodeSurfaceStage: vi.fn(),
}));

const mocked = vi.mocked(api);
let root: Root;
let container: HTMLDivElement;
function sources(agentRound: boolean | undefined, deleted = false): api.CodeSurfaceSources {
  return {
    slug: 'sky-dodge',
    version: 'base',
    readOnly: false,
    agentRound,
    files: deleted ? [] : [{ path: 'game.ts', content: 'agent edit', stagedBy: 'agent' }],
    deleted: deleted ? ['game.ts'] : [],
    staged: { totalBytes: 0, maxBytes: 1_000_000, maxFiles: 60, updatedAt: null },
  };
}
beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  resetCodeSurfaceSessionState();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.resetAllMocks();
  mocked.rebuildCodeSurfaceStage.mockResolvedValue({ scheduled: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render() {
  await act(async () => {
    root.render(createElement(CodeSurface, { slug: 'sky-dodge', onBack: () => {} }));
  });
  await act(async () => {
    await Promise.resolve();
  });
}

it.each([false, true])('offers confirmed discard for closed-round agent staging (deleted: %s)', async (deleted) => {
  mocked.fetchCodeSurfaceSources.mockResolvedValueOnce(sources(false, deleted)).mockResolvedValue(sources(false, true));
  mocked.discardCodeSurfaceEdits.mockResolvedValue({ cleared: 1 });
  await render();
  const discard = container.querySelector<HTMLButtonElement>('.code-surface-discard');
  expect(discard).not.toBeNull();
  await act(async () => {
    discard!.click();
  });
  expect(mocked.discardCodeSurfaceEdits).not.toHaveBeenCalled();
  mocked.fetchCodeSurfaceSources.mockResolvedValue({
    ...sources(false),
    files: [{ path: 'game.ts', content: 'base' }],
    deleted: [],
  });
  await act(async () => {
    document.querySelector<HTMLButtonElement>('[data-testid="code-tree-confirm"]')!.click();
  });
  expect(mocked.discardCodeSurfaceEdits).toHaveBeenCalledWith('sky-dodge');
  expect(container.textContent).toMatch(/No local changes/i);
});

it.each([true, undefined])(
  'keeps agent-only staging out of owner discard while round activity is %s',
  async (agentRound) => {
    mocked.fetchCodeSurfaceSources.mockResolvedValue(sources(agentRound));
    await render();
    expect(container.querySelector('.code-surface-discard')).toBeNull();
  },
);
