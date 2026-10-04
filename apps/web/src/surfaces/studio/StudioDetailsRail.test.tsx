// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { StudioDetailsRail } from './StudioDetailsRail.js';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

it('resizes by keyboard, clamps to the stage, remembers preference and removes the handle in sheets', async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  const stage = document.createElement('div');
  Object.defineProperty(stage, 'clientWidth', { configurable: true, value: 1000 });
  document.body.appendChild(stage);
  const root = createRoot(stage);
  try {
    await act(async () => root.render(<StudioDetailsRail isSheet={false}>content</StudioDetailsRail>));
    const handle = stage.querySelector('[role="separator"]')!;
    expect(handle.getAttribute('aria-valuenow')).toBe('480');
    const key = async (value: string) =>
      act(async () => {
        handle.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
      });
    await key('End');
    expect(handle.getAttribute('aria-valuenow')).toBe('720');
    Object.defineProperty(stage, 'clientWidth', { configurable: true, value: 620 });
    await act(async () => window.dispatchEvent(new Event('resize')));
    expect(handle.getAttribute('aria-valuemax')).toBe('572');
    expect(handle.getAttribute('aria-valuenow')).toBe('572');
    await key('Home');
    expect(handle.getAttribute('aria-valuenow')).toBe('360');
    await key('ArrowRight');
    expect(handle.getAttribute('aria-valuenow')).toBe('360');
    await key('ArrowLeft');
    expect(handle.getAttribute('aria-valuenow')).toBe('400');
    expect(localStorage.getItem('gdpl:studio-details-width')).toBe('400');
    await act(async () => root.render(<StudioDetailsRail isSheet={true}>content</StudioDetailsRail>));
    expect(stage.querySelector('[role="separator"]')).toBeNull();
    expect(stage.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
  } finally {
    await act(async () => root.unmount());
    stage.remove();
    localStorage.clear();
  }
});
