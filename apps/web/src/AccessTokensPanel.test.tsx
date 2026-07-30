// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccessTokensPanel } from './AccessTokensPanel.js';
import type { AccessToken } from './adminApi.js';

const mocked = vi.hoisted(() => ({
  fetchAdminSummary: vi.fn(),
  fetchCreationLimits: vi.fn(),
  setCreationLimits: vi.fn(),
  fetchSuggestions: vi.fn(),
  fetchAccessTokens: vi.fn(),
  mintAccessToken: vi.fn(),
  revokeAccessToken: vi.fn(),
}));

vi.mock('./adminApi.js', () => mocked);

function token(overrides: Partial<AccessToken> = {}): AccessToken {
  return {
    tokenId: 'aaaaaaaaaaaaaaaa',
    uid: 'g:agent',
    name: 'agent VM',
    createdAt: '2026-07-01T10:00:00Z',
    createdByUid: 'g:boss',
    expiresAt: '2026-08-15T10:00:00Z',
    lastUsedAt: null,
    expired: false,
    ...overrides,
  };
}

async function render() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(AccessTokensPanel));
    await Promise.resolve();
  });
  return { container, root };
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((element) => element.textContent === label);
  if (!found) throw new Error(`no button labelled ${label}`);
  return found as HTMLButtonElement;
}

/** Types into a controlled input the way React's onChange expects. */
async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function inputFor(container: HTMLElement, label: string): HTMLInputElement {
  const found = Array.from(container.querySelectorAll('label')).find((element) =>
    element.textContent?.startsWith(label),
  );
  const input = found?.querySelector('input');
  if (!input) throw new Error(`no input labelled ${label}`);
  return input;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('AccessTokensPanel', () => {
  it('lists the tokens an account holds and offers to revoke each one', async () => {
    mocked.fetchAccessTokens.mockResolvedValue([token(), token({ tokenId: 'bbbbbbbbbbbbbbbb', expired: true })]);

    const { container, root } = await render();
    await type(inputFor(container, 'Account uid'), 'g:agent');
    await act(async () => {
      button(container, 'List').click();
    });

    expect(mocked.fetchAccessTokens).toHaveBeenCalledWith('g:agent');
    expect(container.querySelectorAll('.admin-token-row')).toHaveLength(2);
    // An expired token is still listed: revoking it is still worth doing, and its
    // absence would read as "already gone".
    expect(container.querySelectorAll('.admin-token-row.is-expired')).toHaveLength(1);

    await act(async () => root.unmount());
  });

  it('shows the minted secret once, and says that is the only time', async () => {
    mocked.fetchAccessTokens.mockResolvedValue([token()]);
    mocked.mintAccessToken.mockResolvedValue({ ...token(), token: 'gdpl_pat_secret' });

    const { container, root } = await render();
    await type(inputFor(container, 'Account uid'), 'g:agent');
    await type(inputFor(container, 'Label'), 'agent VM');
    await act(async () => {
      button(container, 'Mint').click();
    });

    const secret = container.querySelector('.admin-token-secret');
    expect(secret?.textContent).toContain('gdpl_pat_secret');
    expect(secret?.textContent).toContain('cannot be shown again');

    await act(async () => root.unmount());
  });

  it('explains a refusal in terms of what to do about it', async () => {
    mocked.mintAccessToken.mockResolvedValue({ error: 'unknown_uid' });

    const { container, root } = await render();
    await type(inputFor(container, 'Account uid'), 'g:nobody');
    await type(inputFor(container, 'Label'), 'agent VM');
    await act(async () => {
      button(container, 'Mint').click();
    });

    expect(container.querySelector('.admin-limits-message')?.textContent).toBe('no such account — check the uid');
    expect(container.querySelector('.admin-token-secret')).toBeNull();

    await act(async () => root.unmount());
  });

  it('clears the list when a lookup comes back empty-handed', async () => {
    // Otherwise the previous account's tokens sit under the new uid, and revoking off a
    // mislabelled list is a mistake this panel would have invited.
    mocked.fetchAccessTokens.mockResolvedValueOnce([token()]).mockResolvedValueOnce(null);

    const { container, root } = await render();
    await type(inputFor(container, 'Account uid'), 'g:agent');
    await act(async () => {
      button(container, 'List').click();
    });
    expect(container.querySelectorAll('.admin-token-row')).toHaveLength(1);

    await type(inputFor(container, 'Account uid'), 'g:nobody');
    await act(async () => {
      button(container, 'List').click();
    });

    expect(container.querySelectorAll('.admin-token-row')).toHaveLength(0);
    expect(container.querySelector('.admin-limits-message')?.textContent).toBe('not found');

    await act(async () => root.unmount());
  });

  it('says so when a revoke never reached the API, rather than going quiet', async () => {
    // The one failure that must not look like silence: an operator would walk away
    // believing the credential is dead.
    mocked.fetchAccessTokens.mockResolvedValue([token()]);
    mocked.revokeAccessToken.mockRejectedValue(new Error('offline'));

    const { container, root } = await render();
    await type(inputFor(container, 'Account uid'), 'g:agent');
    await act(async () => {
      button(container, 'List').click();
    });
    await act(async () => {
      button(container, 'Revoke').click();
    });

    expect(container.querySelector('.admin-limits-message')?.textContent).toBe('could not reach the API');

    await act(async () => root.unmount());
  });

  it('refuses to mint without both an account and a label', async () => {
    const { container, root } = await render();

    expect(button(container, 'Mint').disabled).toBe(true);
    await type(inputFor(container, 'Account uid'), 'g:agent');
    expect(button(container, 'Mint').disabled).toBe(true);

    await act(async () => root.unmount());
  });
});
