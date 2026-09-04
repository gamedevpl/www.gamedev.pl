// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchKit = vi.fn();
const createService = vi.fn();

vi.mock('./codeSurfaceApi.js', () => ({ fetchCodeSurfaceKitDeclaration: (slug: string) => fetchKit(slug) }));
vi.mock('./codeSurfaceLanguageBind.js', () => ({
  flushLanguageFileUpdates: vi.fn(),
  queueLanguageFileUpdate: vi.fn(),
}));
vi.mock('./codeSurfaceLanguageService.js', () => ({
  createCodeSurfaceLanguageService: (...args: unknown[]) => createService(...args),
}));

const { useCodeSurfaceLanguageService } = await import('./useCodeSurfaceLanguageService.js');

describe('useCodeSurfaceLanguageService', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    fetchKit.mockReset();
    createService.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function Probe() {
    const { kitDeclaration } = useCodeSurfaceLanguageService({
      slug: 'demo',
      editable: true,
      sourcesRef: { current: { files: [{ path: 'game.ts', content: '' }] } as never },
      draftsRef: { current: {} },
    });
    return createElement('span', { 'data-testid': 'kit' }, kitDeclaration ?? 'none');
  }

  // A null worker leaves `ready` false, so nothing else re-renders.
  it('surfaces the kit declaration even when the worker fails to boot', async () => {
    fetchKit.mockResolvedValue({ declaration: 'declare const kit: unknown;' });
    createService.mockResolvedValue(null);

    await act(async () => {
      root.render(createElement(Probe));
    });
    await act(async () => {});

    expect(container.querySelector('[data-testid="kit"]')?.textContent).toBe('declare const kit: unknown;');
  });
});
