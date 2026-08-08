// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicPlayPanel } from './PublicPlayPanel.js';

const mocked = vi.hoisted(() => ({
  fetchPublicPlay: vi.fn(),
  setPublicPlaySlugs: vi.fn(),
}));

vi.mock('./adminApi.js', () => mocked);

const config = {
  stored: null,
  effective: { slugs: ['airtime'] },
  propagationMs: 60_000,
};

async function render() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(PublicPlayPanel));
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('PublicPlayPanel', () => {
  it('loads the effective promotional list', async () => {
    mocked.fetchPublicPlay.mockResolvedValue(config);

    const { container, root } = await render();

    expect(container.querySelector<HTMLInputElement>('input')?.value).toBe('airtime');
    await act(async () => root.unmount());
  });

  it('saves a normalized comma-separated list', async () => {
    mocked.fetchPublicPlay.mockResolvedValue(config);
    mocked.setPublicPlaySlugs.mockResolvedValue({
      stored: { slugs: ['airtime', 'another-game'], updatedBy: 'g:boss' },
      effective: { slugs: ['airtime', 'another-game'] },
      propagationMs: 60_000,
    });

    const { container, root } = await render();
    const input = container.querySelector<HTMLInputElement>('input');
    if (!input) throw new Error('missing slug input');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, ' Airtime, another-game, airtime ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      container.querySelector<HTMLButtonElement>('button')?.click();
    });

    expect(mocked.setPublicPlaySlugs).toHaveBeenCalledWith(['airtime', 'another-game']);
    expect(container.querySelector('.admin-limits-message')?.textContent).toContain('within 60s');
    await act(async () => root.unmount());
  });
});
