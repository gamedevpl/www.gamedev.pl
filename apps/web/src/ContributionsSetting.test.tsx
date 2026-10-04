// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { ContributionsSetting } from './ContributionsSetting.js';

let container: HTMLDivElement;
let root: Root | null = null;
let remixMode: 'on' | 'off' | null = 'on';
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
  remixMode = 'on';
  putStatus = 200;
  puts.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        puts.push({ url, body: JSON.parse(String(init.body)) });
        return json({ ok: true }, putStatus);
      }
      if (url.endsWith('/remix')) return remixMode ? json({ mode: remixMode }) : json({ error: 'not_found' }, 404);
      if (url.endsWith('/contributions')) return json({ mode: 'off' });
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
  it('shows the remix switch, on by default, beside contributions', async () => {
    await draw();
    expect(container.querySelector('[aria-label="Remixing"]')).not.toBeNull();
    expect(radio('Allow remixing').getAttribute('aria-checked')).toBe('true');
    expect(radio('Allow remixing').textContent).toContain('never changes your game');
    expect(container.textContent).toContain("agents can read your game's sources");
  });

  it('turns remix off for this game with one tap', async () => {
    await draw();
    await act(async () => {
      radio('Off').click();
    });
    // Remix's Off radio renders first.
    expect(puts).toEqual([{ url: '/api/me/games/dog-dash/remix', body: { mode: 'off' } }]);
    expect(radio('Allow remixing').getAttribute('aria-checked')).toBe('false');
  });

  it('puts the switch back when saving fails', async () => {
    putStatus = 500;
    await draw();
    await act(async () => {
      radio('Off').click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(radio('Allow remixing').getAttribute('aria-checked')).toBe('true');
  });

  it('renders no remix switch when the game is not the caller’s', async () => {
    remixMode = null;
    await draw();
    expect(container.querySelector('[aria-label="Remixing"]')).toBeNull();
    expect(container.querySelector('[aria-label="Contributions"]')).not.toBeNull();
  });
});
