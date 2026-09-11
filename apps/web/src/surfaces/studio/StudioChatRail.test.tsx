// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { StudioChatRail } from './StudioChatRail.js';

function mockSheetMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

describe('StudioChatRail', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('names the close action on desktop without a no-op pop-out link', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockSheetMedia(false);
    await i18n.changeLanguage('en');
    const onOpenChange = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <StudioChatRail title="Sky Dodge" open onOpenChange={onOpenChange} unreadCount={0}>
          <p>Thread</p>
        </StudioChatRail>,
      );
    });

    const close = host.querySelector<HTMLButtonElement>('.studio-chat-rail-close');
    expect(host.querySelector('.studio-chat-rail-popout')).toBeNull();
    expect(host.querySelector('.studio-chat-rail-expand')).toBeNull();
    expect(host.querySelectorAll('.studio-chat-rail-head-action')).toHaveLength(1);
    expect(close?.getAttribute('aria-label')).toBe('Close chat');
    expect(close?.dataset.tooltip).toBe('Close chat');
    expect(close?.querySelector('svg')?.getAttribute('width')).toBe('14');

    await act(async () => {
      close?.click();
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);

    await act(async () => root.unmount());
  });

  it('measures the site header so chat does not cover navigation', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockSheetMedia(true);
    const header = document.createElement('header');
    header.className = 'app-header';
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue({
      height: 71,
      width: 390,
      top: 0,
      left: 0,
      bottom: 71,
      right: 390,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    document.body.appendChild(header);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <StudioChatRail title="Sky Dodge" open onOpenChange={vi.fn()} unreadCount={0}>
          <p>Thread</p>
        </StudioChatRail>,
      );
    });

    expect(document.documentElement.style.getPropertyValue('--studio-chat-rail-top-inset')).toBe('71px');

    await act(async () => root.unmount());
    header.remove();
  });

  it('keeps a phone peek detent while another pane temporarily covers chat', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockSheetMedia(true);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const render = (covered: boolean) =>
      root.render(
        <StudioChatRail title="Sky Dodge" open covered={covered} onOpenChange={vi.fn()} unreadCount={0}>
          <p>Thread</p>
        </StudioChatRail>,
      );

    await act(async () => render(false));
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.studio-chat-rail-grab')?.click();
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.studio-chat-rail-grab')?.click();
    });
    expect(host.querySelector('.studio-chat-rail')?.classList.contains('is-peek')).toBe(true);

    await act(async () => render(true));
    expect(host.querySelector('.studio-chat-rail')?.classList.contains('is-collapsed')).toBe(true);
    await act(async () => render(false));
    expect(host.querySelector('.studio-chat-rail')?.classList.contains('is-peek')).toBe(true);

    await act(async () => root.unmount());
  });

  it('expands the phone sheet to full screen from the header control', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockSheetMedia(true);
    await i18n.changeLanguage('en');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <StudioChatRail title="Sky Dodge" open onOpenChange={vi.fn()} unreadCount={0}>
          <p>Thread</p>
        </StudioChatRail>,
      );
    });

    const rail = host.querySelector('.studio-chat-rail');
    const expand = host.querySelector<HTMLButtonElement>('.studio-chat-rail-expand');
    expect(rail?.classList.contains('is-half')).toBe(true);
    expect(expand?.getAttribute('aria-label')).toBe('Full screen');
    expect(expand?.getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('.studio-chat-rail-popout')).toBeNull();

    await act(async () => {
      expand?.click();
    });
    expect(rail?.classList.contains('is-full')).toBe(true);
    expect(expand?.getAttribute('aria-label')).toBe('Exit full screen');
    expect(expand?.getAttribute('aria-pressed')).toBe('true');

    await act(async () => {
      expand?.click();
    });
    expect(rail?.classList.contains('is-half')).toBe(true);

    await act(async () => root.unmount());
  });

  it('snaps a dragged grab handle to the nearest detent', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockSheetMedia(true);
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(true);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <StudioChatRail title="Sky Dodge" open onOpenChange={vi.fn()} unreadCount={0}>
          <p>Thread</p>
        </StudioChatRail>,
      );
    });

    const rail = host.querySelector('.studio-chat-rail') as HTMLElement;
    const grab = host.querySelector<HTMLButtonElement>('.studio-chat-rail-grab');
    vi.spyOn(rail, 'getBoundingClientRect').mockReturnValue({
      height: 384,
      width: 390,
      top: 416,
      left: 0,
      bottom: 800,
      right: 390,
      x: 0,
      y: 416,
      toJSON: () => ({}),
    });

    await act(async () => {
      grab?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientY: 500, button: 0 }));
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientY: 180 }));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientY: 180 }));
    });
    expect(rail.classList.contains('is-dragging')).toBe(false);
    expect(rail.classList.contains('is-full')).toBe(true);
    expect(rail.style.getPropertyValue('--studio-chat-rail-peek-height')).toBe('124px');

    await act(async () => root.unmount());
  });

  it('finishes a drag when pointer capture is unavailable', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockSheetMedia(true);
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    HTMLElement.prototype.setPointerCapture = vi.fn(() => {
      throw new Error('capture unavailable');
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <StudioChatRail title="Sky Dodge" open onOpenChange={vi.fn()} unreadCount={0}>
          <p>Thread</p>
        </StudioChatRail>,
      );
    });

    const rail = host.querySelector('.studio-chat-rail') as HTMLElement;
    const grab = host.querySelector<HTMLButtonElement>('.studio-chat-rail-grab');
    vi.spyOn(rail, 'getBoundingClientRect').mockReturnValue({
      height: 384,
      width: 390,
      top: 416,
      left: 0,
      bottom: 800,
      right: 390,
      x: 0,
      y: 416,
      toJSON: () => ({}),
    });

    await act(async () => {
      grab?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2, clientY: 500, button: 0 }));
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 2, clientY: 180 }));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2, clientY: 180 }));
    });

    expect(rail.classList.contains('is-full')).toBe(true);
    await act(async () => root.unmount());
  });
});
