// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { StudioTransferProposalConfirm } from './StudioTransferProposalConfirm.js';

const PROPOSAL = {
  proposalId: '11111111-2222-4333-8444-555555555555',
  slug: 'sky',
  status: 'ready',
  expiresAt: '2026-01-02T00:00:00.000Z',
  title: 'Sky',
};

vi.mock('../../visitTelemetry.js', () => ({ recordTransferStep: vi.fn() }));

function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  return { host, root: createRoot(host) };
}

describe('StudioTransferProposalConfirm', () => {
  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('loads with the session cookie and sends a recipient code', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? {
            ok: true,
            json: async () => ({
              transfer: { status: 'pending', counterparty: { profileName: 'Grace' }, expiresAt: PROPOSAL.expiresAt },
            }),
          }
        : { ok: true, json: async () => ({ proposal: PROPOSAL }) },
    );
    vi.stubGlobal('fetch', fetchMock);
    const onOpenStudio = vi.fn();
    const { host, root } = mount();
    await act(async () => {
      root.render(
        createElement(StudioTransferProposalConfirm, {
          slug: 'sky',
          proposalId: PROPOSAL.proposalId,
          onOpenStudio,
        }),
      );
    });
    expect(host.querySelector('[data-testid="studio-transfer-propose"]')?.textContent).toContain(
      'Confirm this transfer',
    );
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => init?.credentials === 'include')).toBe(true);
    const input = host.querySelector<HTMLInputElement>('[data-testid="studio-transfer-propose-code"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'GRACE-CODE');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))).toEqual({ recipientCode: 'GRACE-CODE' });
    expect(host.querySelector('[data-testid="studio-transfer-propose-sent"]')?.textContent).toContain('Grace');
    const { recordTransferStep } = await import('../../visitTelemetry.js');
    expect(vi.mocked(recordTransferStep)).toHaveBeenCalledWith('invite_sent');
    await act(async () => root.unmount());
  });

  it('shows a missing proposal without treating it as another person’s', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({ error: 'not_found' }) })),
    );
    const { host, root } = mount();
    await act(async () => {
      root.render(
        createElement(StudioTransferProposalConfirm, {
          slug: 'sky',
          proposalId: PROPOSAL.proposalId,
          onOpenStudio: vi.fn(),
        }),
      );
    });
    expect(host.textContent).toContain('gone or is not yours');
    await act(async () => root.unmount());
  });

  it('does not offer a form after the proposal expires', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ proposal: { ...PROPOSAL, status: 'expired' } }) })),
    );
    const { host, root } = mount();
    await act(async () => {
      root.render(
        createElement(StudioTransferProposalConfirm, {
          slug: 'sky',
          proposalId: PROPOSAL.proposalId,
          onOpenStudio: vi.fn(),
        }),
      );
    });
    expect(host.querySelector('[data-testid="studio-transfer-propose-code"]')).toBeNull();
    expect(host.textContent).toContain('Ask the agent to start a new one');
    await act(async () => root.unmount());
  });

  it('shows the invitation already out instead of blaming a build round', async () => {
    const pending = {
      slug: 'sky',
      status: 'pending',
      you: 'sender',
      counterparty: { profileName: 'Ada' },
      createdAt: PROPOSAL.expiresAt,
      expiresAt: PROPOSAL.expiresAt,
    };
    let sent = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          sent = true;
          return { ok: false, status: 409, json: async () => ({ error: 'busy' }) };
        }
        if (String(url).includes('/propose/')) {
          return { ok: true, json: async () => ({ proposal: PROPOSAL }) };
        }
        return { ok: true, json: async () => ({ transfer: sent ? pending : null }) };
      }),
    );
    const { host, root } = mount();
    await act(async () => {
      root.render(
        createElement(StudioTransferProposalConfirm, {
          slug: 'sky',
          proposalId: PROPOSAL.proposalId,
          onOpenStudio: vi.fn(),
        }),
      );
    });
    const input = host.querySelector<HTMLInputElement>('[data-testid="studio-transfer-propose-code"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'ADA-CODE');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(host.querySelector('[data-testid="studio-transfer-propose-sent"]')?.textContent).toContain('Ada');
    expect(host.querySelector('[data-testid="studio-transfer-propose-error"]')).toBeNull();
    expect(host.textContent).not.toContain('build round');
    await act(async () => root.unmount());
  });

  it('falls back to a plain message when busy but no invitation comes back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return { ok: false, status: 409, json: async () => ({ error: 'busy' }) };
        }
        if (String(url).includes('/propose/')) {
          return { ok: true, json: async () => ({ proposal: PROPOSAL }) };
        }
        return { ok: true, json: async () => ({ transfer: null }) };
      }),
    );
    const { host, root } = mount();
    await act(async () => {
      root.render(
        createElement(StudioTransferProposalConfirm, {
          slug: 'sky',
          proposalId: PROPOSAL.proposalId,
          onOpenStudio: vi.fn(),
        }),
      );
    });
    const input = host.querySelector<HTMLInputElement>('[data-testid="studio-transfer-propose-code"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'ADA-CODE');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(host.querySelector('[data-testid="studio-transfer-propose-error"]')?.textContent).toContain('already out');
    expect(host.querySelector('[data-testid="studio-transfer-propose-error"]')?.textContent).not.toContain(
      'build round',
    );
    await act(async () => root.unmount());
  });

  it('recovers a pending invitation when a confirmed proposal is reopened', async () => {
    const pending = {
      slug: 'sky',
      status: 'pending',
      you: 'sender',
      counterparty: { profileName: 'Ada' },
      createdAt: PROPOSAL.expiresAt,
      expiresAt: PROPOSAL.expiresAt,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/propose/')) {
          return { ok: true, json: async () => ({ proposal: { ...PROPOSAL, status: 'confirmed' } }) };
        }
        return { ok: true, json: async () => ({ transfer: pending }) };
      }),
    );
    const { host, root } = mount();
    await act(async () => {
      root.render(
        createElement(StudioTransferProposalConfirm, {
          slug: 'sky',
          proposalId: PROPOSAL.proposalId,
          onOpenStudio: vi.fn(),
        }),
      );
    });
    expect(host.querySelector('[data-testid="studio-transfer-propose-code"]')).toBeNull();
    expect(host.querySelector('[data-testid="studio-transfer-propose-sent"]')?.textContent).toContain('Ada');
    expect(host.textContent).not.toContain('gone or is not yours');
    await act(async () => root.unmount());
  });

  it('says the invitation was sent when a confirmed proposal has no open offer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/propose/')) {
          return { ok: true, json: async () => ({ proposal: { ...PROPOSAL, status: 'confirmed' } }) };
        }
        return { ok: true, json: async () => ({ transfer: null }) };
      }),
    );
    const { host, root } = mount();
    await act(async () => {
      root.render(
        createElement(StudioTransferProposalConfirm, {
          slug: 'sky',
          proposalId: PROPOSAL.proposalId,
          onOpenStudio: vi.fn(),
        }),
      );
    });
    expect(host.querySelector('[data-testid="studio-transfer-propose-code"]')).toBeNull();
    expect(host.textContent).toContain('already sent');
    expect(host.textContent).not.toContain('gone or is not yours');
    await act(async () => root.unmount());
  });
});
