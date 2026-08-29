// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { StudioWorkspaceCheckoutPanel } from './StudioWorkspaceCheckoutPanel.js';

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

function archiveResponse() {
  return {
    ok: true,
    status: 200,
    headers: new Headers({
      'content-type': 'application/gzip',
      'content-disposition': 'attachment; filename="sky-dodge-workspace.tgz"',
    }),
    blob: async () => new Blob(['tgz-bytes'], { type: 'application/gzip' }),
  };
}

function errorResponse(status: number, body: Record<string, unknown>) {
  return { ok: false, status, headers: new Headers(), json: async () => body };
}

describe('StudioWorkspaceCheckoutPanel', () => {
  let container: HTMLDivElement;
  let root: Root;
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  /** Anchors the panel builds to hand the archive over; jsdom cannot follow the click. */
  let clicked: Array<{ download: string; href: string }>;
  const realAnchorClick = HTMLAnchorElement.prototype.click;

  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    // jsdom implements neither, and the panel's whole success path is the object URL.
    createObjectURL = vi.fn(() => 'blob:workspace');
    revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    clicked = [];
    HTMLAnchorElement.prototype.click = function record(this: HTMLAnchorElement) {
      clicked.push({ download: this.download, href: this.href });
    };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    HTMLAnchorElement.prototype.click = realAnchorClick;
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function render(slug = 'sky-dodge') {
    await act(async () => {
      root.render(createElement(StudioWorkspaceCheckoutPanel, { slug }));
      await flush();
    });
  }

  function startButton(): HTMLButtonElement {
    const button = container.querySelector<HTMLButtonElement>('[data-testid="workspace-checkout-start"]');
    if (!button) throw new Error('checkout button is not rendered');
    return button;
  }

  async function click() {
    await act(async () => {
      startButton().click();
      await flush();
    });
    await act(async () => {
      await flush();
    });
  }

  it('checks the working copy out and hands the archive to the browser', async () => {
    const fetchMock = vi.fn(async () => archiveResponse());
    vi.stubGlobal('fetch', fetchMock);

    await render();
    await click();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/me/studio/games/sky-dodge/workspace',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(clicked).toEqual([{ download: 'sky-dodge-workspace.tgz', href: 'blob:workspace' }]);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="workspace-checkout-done"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="workspace-checkout-error"]')).toBeNull();
    // The anchor is a transport, not part of the panel — it must not survive the click.
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('says the game is a checkout that comes back, not a copy to keep', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => archiveResponse()),
    );
    await render();

    const text = container.textContent ?? '';
    expect(text).toContain('Work on this game in your own IDE');
    expect(text).toContain('working copy');
    expect(text).toMatch(/gamedevpl submit/i);
    expect(text).toMatch(/gate and review/i);
    // The feature is explicitly not a way to walk off with the game.
    expect(text).not.toMatch(/export|eject|take your game|download your game/i);
  });

  it.each([
    [401, { error: 'unauthorized' }, /signed out/i],
    [404, { error: 'no such game' }, /couldn't find this game/i],
    [503, { error: 'workspace_scaffold_missing', message: 'no workspace scaffold published' }, /temporarily/i],
    [502, { error: 'the delivered version could not be read back' }, /couldn't put your working copy together/i],
  ])('renders a plain-language message for %i', async (status, body, expected) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => errorResponse(status, body)),
    );
    await render();
    await click();

    const error = container.querySelector('[data-testid="workspace-checkout-error"]');
    expect(error?.textContent ?? '').toMatch(expected);
    expect(container.querySelector('[data-testid="workspace-checkout-done"]')).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('leaks no server wording on failures other than the 409', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        errorResponse(503, { error: 'kit_registry_missing', message: 'the Creator Kit registry is not published yet' }),
      ),
    );
    await render();
    await click();

    const text = container.textContent ?? '';
    expect(text).not.toContain('kit_registry_missing');
    expect(text).not.toContain('the Creator Kit registry is not published yet');
  });

  it('surfaces the 409 message, which names the state the creator can act on', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        errorResponse(409, {
          error: 'nothing_delivered',
          message: 'this game has no delivered version yet — let the first build finish, then check it out',
        }),
      ),
    );
    await render();
    await click();

    expect(container.querySelector('[data-testid="workspace-checkout-error"]')?.textContent).toBe(
      'this game has no delivered version yet — let the first build finish, then check it out',
    );
  });

  it('falls back to translated copy when a 409 arrives without a message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => errorResponse(409, { error: 'nothing_delivered' })),
    );
    await render();
    await click();

    expect(container.querySelector('[data-testid="workspace-checkout-error"]')?.textContent).toMatch(
      /no delivered version yet/i,
    );
  });

  it('disables the button while a checkout is running so it cannot be fired twice', async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn(async () => {
      await gate;
      return archiveResponse();
    });
    vi.stubGlobal('fetch', fetchMock);

    await render();
    await act(async () => {
      startButton().click();
      await flush();
    });

    expect(startButton().disabled).toBe(true);
    expect(startButton().textContent).toMatch(/Preparing/i);

    await act(async () => {
      startButton().click();
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      release?.();
      await flush();
      await flush();
    });
    expect(startButton().disabled).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
