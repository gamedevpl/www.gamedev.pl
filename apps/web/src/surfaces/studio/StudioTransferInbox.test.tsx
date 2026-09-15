// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { StudioTransferInbox } from './StudioTransferInbox.js';

vi.mock('../../visitTelemetry.js', () => ({ recordTransferStep: vi.fn() }));

const OFFER = {
  slug: 'comet-courier',
  status: 'pending',
  you: 'recipient',
  counterparty: { profileName: 'Ada' },
  createdAt: '2026-09-15T10:00:00.000Z',
  expiresAt: '2026-09-22T10:00:00.000Z',
};

function reply(url: string, body: unknown) {
  return { ok: true, json: async () => body, url } as unknown as Response;
}

function routed(incoming: unknown[], code = 'MY-CODE') {
  return vi.fn(async (url: string) => {
    if (String(url).includes('/recipient-code')) return reply(url, { code });
    if (String(url).includes('/transfers/incoming')) return reply(url, { transfers: incoming });
    return reply(url, { transfer: { ...OFFER, status: 'accepted' } });
  });
}

async function mount(onAccepted?: (slug: string) => void, props: Record<string, unknown> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(StudioTransferInbox, { onAccepted, ...props }));
  });
  return { host, root };
}

function click(host: HTMLElement, testid: string) {
  return act(async () => {
    host.querySelector(`[data-testid="${testid}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('StudioTransferInbox', () => {
  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('lists an incoming offer and names who is sending it', async () => {
    vi.stubGlobal('fetch', routed([OFFER]));
    const { host, root } = await mount();

    const invite = host.querySelector('[data-testid="studio-transfer-invite-comet-courier"]');
    expect(invite?.textContent).toContain('Ada');
    expect(invite?.textContent).toContain('comet-courier');
    await act(async () => root.unmount());
  });

  it('accepting drops the offer and tells the shelf to refetch', async () => {
    vi.stubGlobal('fetch', routed([OFFER]));
    const onAccepted = vi.fn();
    const { host, root } = await mount(onAccepted);

    await click(host, 'studio-transfer-accept-comet-courier');

    expect(host.querySelector('[data-testid="studio-transfer-invite-comet-courier"]')).toBeNull();
    expect(onAccepted).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });

  it('declining drops the offer without touching the shelf', async () => {
    vi.stubGlobal('fetch', routed([OFFER]));
    const onAccepted = vi.fn();
    const { host, root } = await mount(onAccepted);

    await click(host, 'studio-transfer-reject-comet-courier');

    expect(host.querySelector('[data-testid="studio-transfer-invite-comet-courier"]')).toBeNull();
    expect(onAccepted).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('explains a busy refusal on accept and keeps the offer in place', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/recipient-code')) return reply(url, { code: 'MY-CODE' });
        if (String(url).includes('/transfers/incoming')) return reply(url, { transfers: [OFFER] });
        return { ok: false, status: 409, json: async () => ({ error: 'busy' }) } as unknown as Response;
      }),
    );
    const { host, root } = await mount();

    await click(host, 'studio-transfer-accept-comet-courier');

    expect(host.querySelector('[data-testid="studio-transfer-inbox-error"]')?.textContent).toContain('build round');
    // The offer is still theirs to accept once the round finishes.
    expect(host.querySelector('[data-testid="studio-transfer-invite-comet-courier"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('renders nothing when no invitation is waiting', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => reply(url, { transfers: [] })),
    );
    const { host, root } = await mount();

    expect(host.querySelector('[data-testid="studio-transfer-inbox"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it('survives a response that carries no transfers at all', async () => {
    // Regression: undefined in state once blanked the whole shelf.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => reply(url, {})),
    );
    const { host, root } = await mount();

    expect(host.querySelector('[data-testid="studio-transfer-inbox"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it('names the accepted slug so the shelf can refetch past its ceiling', async () => {
    // A bare refetch returns the capped page, omitting this game.
    vi.stubGlobal('fetch', routed([OFFER]));
    const onAccepted = vi.fn();
    const { host, root } = await mount(onAccepted);

    await click(host, 'studio-transfer-accept-comet-courier');

    expect(onAccepted).toHaveBeenCalledWith('comet-courier');
    await act(async () => root.unmount());
  });

  it('reports an unreachable inbox rather than showing it as empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/recipient-code')) return reply(url, { code: 'MY-CODE' });
        throw new Error('network down');
      }),
    );
    const { host, root } = await mount();

    expect(host.querySelector('[data-testid="studio-transfer-inbox-unreachable"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="studio-transfer-retry"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('stays visible to retry when both reads fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const { host, root } = await mount();

    expect(host.querySelector('[data-testid="studio-transfer-inbox"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="studio-transfer-retry"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('names each accept refusal from the recipient side', async () => {
    // The panel's wording is the sender's; here it is not.
    for (const [code, expected] of [
      ['recipient_ineligible', 'Your account cannot receive games'],
      ['stale_owner', 'changed hands'],
      ['not_found', 'no longer available'],
    ] as const) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (String(url).includes('/recipient-code')) return reply(url, { code: 'MY-CODE' });
          if (String(url).includes('/transfers/incoming')) return reply(url, { transfers: [OFFER] });
          return { ok: false, status: 409, json: async () => ({ error: code }) } as unknown as Response;
        }),
      );
      const { host, root } = await mount();
      await click(host, 'studio-transfer-accept-comet-courier');

      expect(host.querySelector('[data-testid="studio-transfer-inbox-error"]')?.textContent).toContain(expected);
      await act(async () => root.unmount());
      document.body.innerHTML = '';
      vi.unstubAllGlobals();
    }
  });

  it('does not count an offer it renders where nobody can see it', async () => {
    // A collapsed rail and an off-canvas drawer both keep this mounted.
    const { recordTransferStep } = await import('../../visitTelemetry.js');
    vi.stubGlobal('fetch', routed([OFFER]));
    const { root } = await mount(undefined, { visible: false });

    expect(vi.mocked(recordTransferStep).mock.calls.map(([step]) => step)).not.toContain('offer_shown');
    await act(async () => root.unmount());
  });

  it('counts it once the shelf actually shows it', async () => {
    const { recordTransferStep } = await import('../../visitTelemetry.js');
    vi.stubGlobal('fetch', routed([OFFER]));
    const { root } = await mount(undefined, { visible: true });

    expect(vi.mocked(recordTransferStep).mock.calls.map(([step]) => step)).toContain('offer_shown');
    await act(async () => root.unmount());
  });

  it('asks the shelf to open itself when the invitation would go unread', async () => {
    vi.stubGlobal('fetch', routed([OFFER]));
    const onOffersPresent = vi.fn();
    const { root } = await mount(undefined, { visible: false, onOffersPresent });

    expect(onOffersPresent).toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('leaves a shelf that already shows the offer alone', async () => {
    // Forcing it open there costs the reader a collapse click.
    vi.stubGlobal('fetch', routed([OFFER]));
    const onOffersPresent = vi.fn();
    const { root } = await mount(undefined, { visible: true, onOffersPresent });

    expect(onOffersPresent).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});
