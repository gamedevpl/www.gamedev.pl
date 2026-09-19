// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { StudioMembersPanel } from './StudioMembersPanel.js';

const OWNER = {
  memberKey: 'ownerkeyownerkey',
  role: 'owner',
  profileName: 'Ada',
  you: true,
};

const EDITOR = {
  memberKey: 'editorkeyeditork',
  role: 'editor',
  profileName: 'Bea',
  you: false,
};

const PENDING = {
  inviteId: '22222222-2222-4222-8222-222222222222',
  slug: 'comet-courier',
  status: 'pending',
  you: 'sender',
  counterparty: { profileName: 'Cal' },
  memberKey: 'invitekeyinvitek',
  createdAt: '2026-09-15T10:00:00.000Z',
  expiresAt: '2026-09-22T10:00:00.000Z',
};

function mountPanel() {
  const host = document.createElement('div');
  document.body.append(host);
  return { host, root: createRoot(host) };
}

async function render(host: HTMLElement, root: ReturnType<typeof createRoot>) {
  await act(async () => {
    root.render(createElement(StudioMembersPanel, { slug: 'comet-courier' }));
  });
  return host;
}

describe('StudioMembersPanel', () => {
  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('offers the code form when the owner has no open invitation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ viewerRole: 'owner', owner: OWNER, editors: [], invites: [] }),
      })),
    );
    const { host, root } = mountPanel();
    await render(host, root);

    expect(host.querySelector('[data-testid="studio-share-code"]')).not.toBeNull();
    expect(host.textContent).toContain('Ada');
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => init?.credentials === 'include')).toBe(true);
    await act(async () => root.unmount());
  });

  it('sends the invitation and then shows who it is waiting on', async () => {
    let posted = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          posted = true;
          return { ok: true, json: async () => ({ invite: PENDING }) };
        }
        return {
          ok: true,
          json: async () => ({
            viewerRole: 'owner',
            owner: OWNER,
            editors: [],
            invites: posted ? [PENDING] : [],
          }),
        };
      }),
    );
    const { host, root } = mountPanel();
    await render(host, root);

    const input = host.querySelector<HTMLInputElement>('[data-testid="studio-share-code"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'ADA-CODE');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(host.querySelector('[data-testid="studio-share-pending-invitekeyinvitek"]')?.textContent).toContain('Cal');
    expect(host.querySelector('[data-testid="studio-share-code"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('keeps the invite form while a pending invitation is open', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ viewerRole: 'owner', owner: OWNER, editors: [], invites: [PENDING] }),
      })),
    );
    const { host, root } = mountPanel();
    await render(host, root);
    expect(host.querySelector('[data-testid="studio-share-pending-invitekeyinvitek"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="studio-share-code"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('lets the owner remove an editor and an editor leave', async () => {
    let removed = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/remove')) {
          removed = true;
          return { ok: true, json: async () => ({ ok: true }) };
        }
        return {
          ok: true,
          json: async () => ({
            viewerRole: 'owner',
            owner: OWNER,
            editors: removed || init?.method === 'POST' ? [] : [EDITOR],
            invites: [],
          }),
        };
      }),
    );
    const { host, root } = mountPanel();
    await render(host, root);
    expect(host.textContent).toContain('Bea');
    await act(async () => {
      host
        .querySelector('[data-testid="studio-member-remove-editorkeyeditork"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(host.querySelector('[data-testid="studio-member-remove-editorkeyeditork"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it('shows leave for an editor and never the invite form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          viewerRole: 'editor',
          owner: { ...OWNER, you: false },
          editors: [{ ...EDITOR, you: true }],
          invites: [],
        }),
      })),
    );
    const { host, root } = mountPanel();
    await render(host, root);
    expect(host.querySelector('[data-testid="studio-share-code"]')).toBeNull();
    expect(host.querySelector('[data-testid="studio-share-leave"]')).not.toBeNull();
    await act(async () => root.unmount());
  });
});
