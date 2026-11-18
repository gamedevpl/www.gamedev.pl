// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { NAVIGATE_EVENT } from './core/router.js';

const auth = vi.hoisted(() => ({ user: null as { uid: string } | null }));
vi.mock('./AuthContext.js', () => ({ useAuth: () => auth }));
vi.mock('./SiteAssistantChat.js', () => ({
  SiteAssistantChat: () => createElement('div', { className: 'chat-stub' }, 'chat'),
}));

import { SiteAssistant } from './SiteAssistant.js';

let container: HTMLDivElement;
let root: Root | null = null;
let fetchMock: ReturnType<typeof vi.fn>;

async function mount(path: string, status = 200) {
  window.history.replaceState(null, '', path);
  fetchMock = vi.fn(async () => new Response('{}', { status }));
  vi.stubGlobal('fetch', fetchMock);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(SiteAssistant));
  });
}
const launcher = () => container.querySelector<HTMLButtonElement>('.site-assistant-launcher');

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  container = document.createElement('div');
  document.body.appendChild(container);
  auth.user = { uid: 'g:visitor' };
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('SiteAssistant', () => {
  it('shows the mascot to a signed-in visitor once the server offers it', async () => {
    await mount('/');
    expect(fetchMock).toHaveBeenCalledWith('/api/assistant/info', { credentials: 'same-origin' });
    expect(launcher()?.getAttribute('aria-label')).toBe('Ask the mascot');
    expect(container.querySelector('.chat-stub')).toBeNull();
  });

  it('asks nothing and shows nothing to a signed-out visitor', async () => {
    auth.user = null;
    await mount('/');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(launcher()).toBeNull();
  });

  it('stays away while the server has the assistant switched off', async () => {
    await mount('/', 404);
    expect(launcher()).toBeNull();
  });

  it('keeps out of Studio, creation and a game being played', async () => {
    for (const path of ['/studio', '/create', '/play/neon-canal', '/party']) {
      await mount(path);
      expect(launcher()).toBeNull();
      act(() => root?.unmount());
    }
  });

  it('follows in-app navigation', async () => {
    await mount('/');
    expect(launcher()).not.toBeNull();
    await act(async () => {
      window.history.pushState(null, '', '/create');
      window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: { path: '/create' } }));
    });
    expect(launcher()).toBeNull();
  });

  it('loads the chat on the first press and keeps it while closed', async () => {
    await mount('/');
    await act(async () => launcher()!.click());
    expect(container.querySelector('.chat-stub')).not.toBeNull();
    expect(launcher()!.getAttribute('aria-expanded')).toBe('true');
    await act(async () => launcher()!.click());
    expect(container.querySelector<HTMLElement>('.site-assistant-panel')!.hidden).toBe(true);
    expect(container.querySelector('.chat-stub')).not.toBeNull();
  });
});
