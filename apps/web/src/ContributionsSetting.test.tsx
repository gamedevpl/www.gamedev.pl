// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { ContributionsSetting } from './ContributionsSetting.js';

let container: HTMLDivElement;
let root: Root | null = null;
let contributionsStatus = 200;
let putStatus = 200;
const puts: Array<{ url: string; body: unknown }> = [];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  container = document.createElement('div');
  document.body.appendChild(container);
  contributionsStatus = 200;
  putStatus = 200;
  puts.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        puts.push({ url, body: JSON.parse(String(init.body)) });
        return json({ ok: true }, putStatus);
      }
      if (url.endsWith('/contributions')) {
        return contributionsStatus === 200 ? json({ mode: 'off' }) : json({ error: 'not_found' }, contributionsStatus);
      }
      if (url.endsWith('/contributor-blocks')) return json({ blocks: [] });
      return json({}, 404);
    }),
  );
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

async function draw() {
  root = createRoot(container);
  await act(async () => {
    root!.render(<ContributionsSetting slug="dog-dash" />);
  });
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

describe('ContributionsSetting', () => {
  it('shows only the contributions switch, off by default, with the source-access note', async () => {
    await draw();
    expect(container.querySelector('[aria-label="Contributions"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="radiogroup"]')).toHaveLength(1);
    expect(radio('Off').getAttribute('aria-checked')).toBe('true');
    expect(radio('Review proposals').textContent).toContain('text suggestions');
    expect(radio('Review proposals').textContent).toContain('code proposals over MCP');
    expect(container.textContent).toContain("read your game's sources");
    expect(container.textContent).not.toMatch(/remix/i);
  });

  it('turns proposals on for this game with one tap', async () => {
    await draw();
    await act(async () => {
      radio('Review proposals').click();
    });
    expect(puts).toEqual([{ url: '/api/me/games/dog-dash/contributions', body: { mode: 'review' } }]);
    expect(radio('Review proposals').getAttribute('aria-checked')).toBe('true');
  });

  it('puts the switch back when saving fails', async () => {
    putStatus = 500;
    await draw();
    await act(async () => {
      radio('Review proposals').click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(radio('Review proposals').getAttribute('aria-checked')).toBe('false');
  });

  it('renders nothing when the game is not the caller’s', async () => {
    contributionsStatus = 404;
    await draw();
    expect(container.innerHTML).toBe('');
  });
});
