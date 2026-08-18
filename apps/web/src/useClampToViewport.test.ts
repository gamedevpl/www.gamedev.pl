// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClampToViewport } from './useClampToViewport.js';

function Probe({ active }: { active: boolean }) {
  const ref = useClampToViewport<HTMLDivElement>(active);
  return createElement('div', { ref, 'data-testid': 'panel' });
}

async function mountProbe(active: boolean) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(Probe, { active }));
  });
  const panel = container.querySelector<HTMLDivElement>('[data-testid="panel"]');
  return { container, root, panel };
}

describe('useClampToViewport', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 400 });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('shifts a panel left when its natural position overflows the right edge', async () => {
    const { container, panel } = await mountProbe(true);
    panel!.getBoundingClientRect = () =>
      ({ left: 264, right: 444, width: 180, top: 0, bottom: 0, height: 0, x: 264, y: 0, toJSON() {} }) as DOMRect;
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(panel!.style.transform).toBe('translateX(-56px)');
    container.remove();
  });

  it('leaves an in-bounds panel untouched', async () => {
    const { container, panel } = await mountProbe(true);
    panel!.getBoundingClientRect = () =>
      ({ left: 100, right: 280, width: 180, top: 0, bottom: 0, height: 0, x: 100, y: 0, toJSON() {} }) as DOMRect;
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(panel!.style.transform).toBe('');
    container.remove();
  });

  it('does nothing while inactive', async () => {
    const { container, panel } = await mountProbe(false);
    panel!.getBoundingClientRect = () =>
      ({ left: 264, right: 444, width: 180, top: 0, bottom: 0, height: 0, x: 264, y: 0, toJSON() {} }) as DOMRect;
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(panel!.style.transform).toBe('');
    container.remove();
  });
});
