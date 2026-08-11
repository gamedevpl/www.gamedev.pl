// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { StudioChatRail } from './StudioChatRail.js';

describe('StudioChatRail', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('separates and names both icon actions', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const onOpenChange = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <StudioChatRail
          title="Sky Dodge"
          open
          onOpenChange={onOpenChange}
          unreadCount={0}
          standaloneHref="/status/sky-dodge"
        >
          <p>Thread</p>
        </StudioChatRail>,
      );
    });

    const popout = host.querySelector<HTMLAnchorElement>('.studio-chat-rail-popout');
    const close = host.querySelector<HTMLButtonElement>('.studio-chat-rail-close');
    expect(host.querySelectorAll('.studio-chat-rail-head-action')).toHaveLength(2);
    expect(popout?.getAttribute('aria-label')).toBe('Open as page');
    expect(popout?.dataset.tooltip).toBe('Open as page');
    expect(popout?.querySelector('svg')?.getAttribute('width')).toBe('14');
    expect(close?.getAttribute('aria-label')).toBe('Close chat');
    expect(close?.dataset.tooltip).toBe('Close chat');
    expect(close?.querySelector('svg')?.getAttribute('width')).toBe('14');

    await act(async () => {
      close?.click();
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);

    await act(async () => root.unmount());
  });

  it('keeps a phone peek detent while another pane temporarily covers chat', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
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
});
