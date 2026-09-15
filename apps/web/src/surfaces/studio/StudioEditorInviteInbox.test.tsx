// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { StudioEditorInviteInbox } from './StudioEditorInviteInbox.js';

const OFFER = {
  slug: 'comet-courier',
  status: 'pending',
  you: 'recipient',
  counterparty: { profileName: 'Ada' },
  memberKey: 'invitekeyinvitek',
  createdAt: '2026-09-15T10:00:00.000Z',
  expiresAt: '2026-09-22T10:00:00.000Z',
};

function reply(url: string, body: unknown) {
  return { ok: true, json: async () => body, url } as unknown as Response;
}

async function mount(onAccepted?: (slug: string) => void) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(StudioEditorInviteInbox, { onAccepted }));
  });
  return { host, root };
}

function click(host: HTMLElement, testid: string) {
  return act(async () => {
    host.querySelector(`[data-testid="${testid}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('StudioEditorInviteInbox', () => {
  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('lists an incoming offer even when the viewer has no games', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => reply(url, { invites: [OFFER] })),
    );
    const { host, root } = await mount();
    const invite = host.querySelector('[data-testid="studio-share-invite-comet-courier"]');
    expect(invite?.textContent).toContain('Ada');
    expect(invite?.textContent).toContain('comet-courier');
    await act(async () => root.unmount());
  });

  it('accepting drops the offer and tells the shelf to refetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) =>
        init?.method === 'POST'
          ? reply(url, { invite: { ...OFFER, status: 'accepted' } })
          : reply(url, { invites: [OFFER] }),
      ),
    );
    const onAccepted = vi.fn();
    const { host, root } = await mount(onAccepted);
    await click(host, 'studio-share-accept-comet-courier');
    expect(host.querySelector('[data-testid="studio-share-invite-comet-courier"]')).toBeNull();
    expect(onAccepted).toHaveBeenCalledWith('comet-courier');
    await act(async () => root.unmount());
  });

  it('declining drops the offer without touching the shelf', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) =>
        init?.method === 'POST'
          ? reply(url, { invite: { ...OFFER, status: 'rejected' } })
          : reply(url, { invites: [OFFER] }),
      ),
    );
    const onAccepted = vi.fn();
    const { host, root } = await mount(onAccepted);
    await click(host, 'studio-share-reject-comet-courier');
    expect(onAccepted).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('renders nothing when there is no offer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => reply(url, { invites: [] })),
    );
    const { host, root } = await mount();
    expect(host.querySelector('[data-testid="studio-share-inbox"]')).toBeNull();
    await act(async () => root.unmount());
  });
});
