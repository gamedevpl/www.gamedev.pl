// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WaitlistPanel } from './WaitlistPanel.js';
import type { WaitlistEntry } from './adminApi.js';

const mocked = vi.hoisted(() => ({
  createBetaInvite: vi.fn(),
  fetchBetaInvites: vi.fn(),
  fetchWaitlist: vi.fn(),
  revokeBetaInvite: vi.fn(),
  setWaitlistStatus: vi.fn(),
  setWaitlistStatusByEmail: vi.fn(),
}));

vi.mock('./adminApi.js', () => mocked);

function entry(overrides: Partial<WaitlistEntry> = {}): WaitlistEntry {
  return {
    uid: 'g:waiter',
    email: 'waiter@example.com',
    name: 'Waiter',
    requestedAt: new Date(Date.now() - 45 * 60_000).toISOString(),
    status: 'pending',
    ...overrides,
  };
}

async function render() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(WaitlistPanel));
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

/** Types into a controlled input the way React's onChange expects. */
async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

beforeEach(() => {
  mocked.fetchBetaInvites.mockResolvedValue([]);
});

describe('WaitlistPanel', () => {
  it('lists pending applicants and can approve one', async () => {
    mocked.fetchWaitlist.mockResolvedValue([entry()]);
    mocked.setWaitlistStatus.mockResolvedValue(entry({ status: 'approved' }));

    const { container, root } = await render();

    expect(mocked.fetchWaitlist).toHaveBeenCalledWith('pending');
    expect(container.textContent).toContain('Waiter');
    expect(container.textContent).toContain('waiter@example.com');

    const approve = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Approve' && !button.closest('.admin-tokens-form'),
    ) as HTMLButtonElement;
    await act(async () => {
      approve.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocked.setWaitlistStatus).toHaveBeenCalledWith('g:waiter', 'approved');

    await act(async () => root.unmount());
  });

  it('pre-approves by email', async () => {
    mocked.fetchWaitlist.mockResolvedValue([]);
    mocked.setWaitlistStatusByEmail.mockResolvedValue(
      entry({ uid: 'email:friend@example.com', email: 'friend@example.com', status: 'approved', name: undefined }),
    );

    const { container, root } = await render();
    const input = container.querySelector('input[type="email"]') as HTMLInputElement;
    await type(input, 'friend@example.com');
    const approve = Array.from(container.querySelectorAll('.admin-tokens-form button')).find(
      (button) => button.textContent === 'Approve',
    ) as HTMLButtonElement;
    await act(async () => {
      approve.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocked.setWaitlistStatusByEmail).toHaveBeenCalledWith('friend@example.com', 'approved');

    await act(async () => root.unmount());
  });

  it('creates and copies a one-time invite link', async () => {
    mocked.fetchWaitlist.mockResolvedValue([]);
    mocked.createBetaInvite.mockResolvedValue({
      invite: {
        id: '11111111-1111-4111-8111-111111111111',
        createdAt: new Date().toISOString(),
        createdByUid: 'g:boss',
        status: 'available',
      },
      code: 'Abc123_-'.repeat(4),
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const { container, root } = await render();
    const create = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Create invite link',
    ) as HTMLButtonElement;

    await act(async () => {
      create.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const link = container.querySelector<HTMLInputElement>('input[aria-label="New beta invite link"]');
    expect(link?.value).toBe(`${window.location.origin}/invite/${'Abc123_-'.repeat(4)}`);
    expect(mocked.createBetaInvite).toHaveBeenCalledOnce();

    const copy = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Copy link',
    ) as HTMLButtonElement;
    await act(async () => {
      copy.click();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(link?.value);

    await act(async () => root.unmount());
  });

  it('tells a non-operator nothing', async () => {
    mocked.fetchWaitlist.mockResolvedValue(null);

    const { container, root } = await render();

    expect(container.textContent).toBe('Not found.');

    await act(async () => root.unmount());
  });

  it('ignores a stale filter response that resolves after a newer one', async () => {
    let resolvePending!: (entries: WaitlistEntry[]) => void;
    mocked.fetchWaitlist.mockImplementation((status: string) => {
      if (status === 'pending') {
        return new Promise<WaitlistEntry[]>((resolve) => {
          resolvePending = resolve;
        });
      }
      return Promise.resolve([entry({ uid: 'g:in', email: 'in@example.com', status: 'approved', name: 'In' })]);
    });

    const { container, root } = await render();
    const approved = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Approved',
    ) as HTMLButtonElement;
    await act(async () => {
      approved.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('In');
    // Pending finally arrives — must not overwrite the Approved list.
    await act(async () => {
      resolvePending([entry()]);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('In');
    expect(container.textContent).not.toContain('Waiter');

    await act(async () => root.unmount());
  });
});
