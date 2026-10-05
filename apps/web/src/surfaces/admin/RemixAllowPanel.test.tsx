// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { RemixAllowPanel } from './RemixAllowPanel.js';

let container: HTMLDivElement;
let root: Root | null = null;
const calls: Array<{ url: string; method: string; body?: unknown }> = [];

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  container = document.createElement('div');
  document.body.appendChild(container);
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
      return Promise.resolve(new Response(JSON.stringify(method === 'PUT' ? { mode: 'on' } : {}), { status: 200 }));
    }),
  );
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function radio(name: string): HTMLButtonElement {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find((button) =>
    button.textContent?.startsWith(name),
  )!;
}

describe('RemixAllowPanel', () => {
  it('opens a game by slug and lets an admin turn remix on', async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(<RemixAllowPanel />);
    });
    expect(container.querySelector('[role="radio"]')).toBeNull();
    expect(calls).toEqual([]);

    const input = container.querySelector('input')!;
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setValue.call(input, ' Orbit ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button')!.click();
    });
    await settle();

    expect(calls).toEqual([{ url: '/api/admin/games/orbit/remix', method: 'GET' }]);
    expect(radio('Off (default)').getAttribute('aria-checked')).toBe('true');

    await act(async () => {
      radio('Allow remixing').click();
    });
    expect(calls[1]).toEqual({ url: '/api/admin/games/orbit/remix', method: 'PUT', body: { mode: 'on' } });
    expect(radio('Allow remixing').getAttribute('aria-checked')).toBe('true');
  });
});
