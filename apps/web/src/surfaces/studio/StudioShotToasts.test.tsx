// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { StudioShotToasts } from './StudioShotToasts.js';

const getSubmissionStatus = vi.fn();

vi.mock('../../submissionApi.js', () => ({
  getSubmissionStatus: (...args: unknown[]) => getSubmissionStatus(...args),
  buildMediaUrl: (_token: string, item: { ref: string }) => `/shot/${item.ref}`,
}));

describe('StudioShotToasts', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    getSubmissionStatus.mockReset();
  });

  it('stacks dismissable screenshot toasts and removes one on dismiss', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    getSubmissionStatus.mockResolvedValue({
      media: [
        { source: 'channel', ref: 'a', label: 'First look' },
        { source: 'channel', ref: 'b', label: 'Boss fight' },
      ],
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<StudioShotToasts token="tok" placement="near-play" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(getSubmissionStatus).toHaveBeenCalledWith('tok', 'en');
    expect(host.querySelector('.studio-shot-toasts.is-near-play')).not.toBeNull();
    expect(host.querySelectorAll('.studio-shot-toast')).toHaveLength(2);

    const dismiss = host.querySelector('.studio-shot-toast-dismiss') as HTMLButtonElement;
    await act(async () => {
      dismiss.click();
    });

    expect(host.querySelectorAll('.studio-shot-toast')).toHaveLength(1);

    root.unmount();
    host.remove();
  });

  it('opens Details Media on click instead of expanding in place', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    getSubmissionStatus.mockResolvedValue({
      media: [{ source: 'channel', ref: 'a', label: 'First look' }],
    });
    const onOpenMedia = vi.fn();

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<StudioShotToasts token="tok" placement="near-play" onOpenMedia={onOpenMedia} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const body = host.querySelector('.studio-shot-toast-body') as HTMLButtonElement;
    await act(async () => {
      body.click();
    });

    expect(onOpenMedia).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.studio-shot-toasts.is-expanded')).toBeNull();

    root.unmount();
    host.remove();
  });

  it('drags the collapsed stack without opening Media', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    getSubmissionStatus.mockResolvedValue({
      media: [{ source: 'channel', ref: 'a', label: 'First look' }],
    });
    const onOpenMedia = vi.fn();

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<StudioShotToasts token="tok" placement="near-play" onOpenMedia={onOpenMedia} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const stack = host.querySelector('[data-testid="studio-shot-toasts"]') as HTMLDivElement;
    Object.defineProperty(stack, 'setPointerCapture', { value: vi.fn(), configurable: true });
    Object.defineProperty(stack, 'releasePointerCapture', { value: vi.fn(), configurable: true });

    await act(async () => {
      stack.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 10, clientY: 10 }));
      stack.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 40, clientY: 30 }));
      stack.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 40, clientY: 30 }));
    });

    expect(stack.style.transform).toMatch(/translate\(/);
    expect(onOpenMedia).not.toHaveBeenCalled();

    await act(async () => {
      (host.querySelector('.studio-shot-toast-body') as HTMLButtonElement).click();
    });
    // Drag suppress swallows the click that follows a drag.
    expect(onOpenMedia).not.toHaveBeenCalled();

    await act(async () => {
      (host.querySelector('.studio-shot-toast-body') as HTMLButtonElement).click();
    });
    expect(onOpenMedia).toHaveBeenCalledTimes(1);

    root.unmount();
    host.remove();
  });

  it('reloads media when the locale changes', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    getSubmissionStatus.mockResolvedValue({ media: [{ source: 'channel', ref: 'a', label: 'Shot' }] });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<StudioShotToasts token="tok" />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(getSubmissionStatus).toHaveBeenCalledWith('tok', 'en');

    await act(async () => {
      await i18n.changeLanguage('pl');
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(getSubmissionStatus).toHaveBeenCalledWith('tok', 'pl');

    root.unmount();
    host.remove();
  });

  it('renders nothing when there is no media', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    getSubmissionStatus.mockResolvedValue({ media: [] });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<StudioShotToasts token="tok" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(host.querySelector('.studio-shot-toasts')).toBeNull();

    root.unmount();
    host.remove();
  });
});
