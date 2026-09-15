// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { StudioTransferPanel } from './StudioTransferPanel.js';

const PENDING = {
  slug: 'comet-courier',
  status: 'pending',
  you: 'sender',
  counterparty: { profileName: 'Ada' },
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
    root.render(createElement(StudioTransferPanel, { slug: 'comet-courier' }));
  });
  return host;
}

function click(host: HTMLElement, testid: string) {
  return act(async () => {
    host.querySelector(`[data-testid="${testid}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('StudioTransferPanel', () => {
  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('offers the code form when the game has no open invitation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ transfer: null }) })),
    );
    const { host, root } = mountPanel();
    await render(host, root);

    expect(host.querySelector('[data-testid="studio-transfer-code"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="studio-transfer-pending"]')).toBeNull();
    // Session cookie, never a bearer token.
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => init?.credentials === 'include')).toBe(true);
    await act(async () => root.unmount());
  });

  it('sends the invitation and then shows who it is waiting on', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? { ok: true, json: async () => ({ transfer: PENDING }) }
        : { ok: true, json: async () => ({ transfer: null }) },
    );
    vi.stubGlobal('fetch', fetchMock);
    const { host, root } = mountPanel();
    await render(host, root);

    const input = host.querySelector<HTMLInputElement>('[data-testid="studio-transfer-code"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'ADA-CODE');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))).toEqual({ recipientCode: 'ADA-CODE' });
    expect(host.querySelector('[data-testid="studio-transfer-pending"]')?.textContent).toContain('Ada');
    // The form is gone: one game cannot have two open invitations.
    expect(host.querySelector('[data-testid="studio-transfer-code"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it('explains a busy refusal as a running round, not a failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === 'POST'
          ? { ok: false, status: 409, json: async () => ({ error: 'busy' }) }
          : { ok: true, json: async () => ({ transfer: null }) },
      ),
    );
    const { host, root } = mountPanel();
    await render(host, root);

    const input = host.querySelector<HTMLInputElement>('[data-testid="studio-transfer-code"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'ADA-CODE');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    const error = host.querySelector('[data-testid="studio-transfer-error"]');
    expect(error?.textContent).toContain('build round');
    // Still offered, because waiting and retrying is the whole remedy.
    expect(host.querySelector('[data-testid="studio-transfer-code"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('cancels an open invitation', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).endsWith('/cancel')
        ? { ok: true, json: async () => ({ transfer: { ...PENDING, status: 'cancelled' } }) }
        : { ok: true, json: async () => ({ transfer: PENDING }) },
    );
    vi.stubGlobal('fetch', fetchMock);
    const { host, root } = mountPanel();
    await render(host, root);

    expect(host.querySelector('[data-testid="studio-transfer-pending"]')).not.toBeNull();
    await click(host, 'studio-transfer-cancel');

    // Cancelled is not pending, so the form comes back.
    expect(host.querySelector('[data-testid="studio-transfer-pending"]')).toBeNull();
    expect(host.querySelector('[data-testid="studio-transfer-code"]')).not.toBeNull();
    await act(async () => root.unmount());
  });
});
