// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SplashMascotGame } from './SplashMascotGame.js';
import i18n from './i18n/index.js';

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('SplashMascotGame', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('keeps the poke mascot until Feed him is pressed', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SplashMascotGame, { pokeLabel: 'Poke' }));
      await flushEffects();
    });

    expect(container.querySelector('button.mascot-interactive.beta-splash__mascot')).not.toBeNull();
    const play = container.querySelector<HTMLButtonElement>('.splash-game__play');
    expect(play).not.toBeNull();
    expect(play?.textContent).toMatch(/feed him/i);
    expect(container.querySelector('.splash-game__stage')).toBeNull();

    await act(async () => root.unmount());
  });

  it('opens a catch stage without dropping the waitlist-sized playfield', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SplashMascotGame, { pokeLabel: 'Poke' }));
      await flushEffects();
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.splash-game__play')?.click();
      await flushEffects();
    });

    const stage = container.querySelector<HTMLDivElement>('.splash-game__stage');
    expect(stage).not.toBeNull();
    expect(container.querySelector('.splash-game--playing')).not.toBeNull();
    expect(container.querySelector('button.mascot-interactive')).toBeNull();
    expect(container.querySelector('.splash-game__catcher')).not.toBeNull();
    expect(container.querySelector('.splash-game__hint')?.textContent).toMatch(/slide to catch/i);

    Object.defineProperty(stage!, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        width: 200,
        height: 160,
        right: 200,
        bottom: 160,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    await act(async () => {
      stage!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 40, clientY: 80 }));
    });
    expect(container.querySelector<HTMLElement>('.splash-game__catcher')?.style.left).toBe('20%');

    await act(async () => root.unmount());
  });

  it('moves the mascot with arrow keys', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SplashMascotGame, { pokeLabel: 'Poke' }));
      await flushEffects();
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.splash-game__play')?.click();
      await flushEffects();
    });

    const stage = container.querySelector<HTMLDivElement>('.splash-game__stage')!;
    await act(async () => {
      stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(container.querySelector<HTMLElement>('.splash-game__catcher')?.style.left).toBe('60%');

    await act(async () => root.unmount());
  });

  it('lets Again start a new round after three misses', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      return setTimeout(() => {
        now += 16;
        cb(now);
      }, 16) as unknown as number;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      clearTimeout(id);
    });

    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SplashMascotGame, { pokeLabel: 'Poke' }));
      await flushEffects();
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.splash-game__play')?.click();
      await flushEffects();
    });

    await act(async () => {
      vi.advanceTimersByTime(20_000);
      await flushEffects();
    });

    expect(container.querySelector('.splash-game--over')).not.toBeNull();
    const again = container.querySelector<HTMLButtonElement>('.splash-game__again');
    expect(again).not.toBeNull();

    await act(async () => {
      again!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      again!.click();
      await flushEffects();
    });

    expect(container.querySelector('.splash-game--playing')).not.toBeNull();
    expect(container.querySelector('.splash-game--over')).toBeNull();
    expect(container.querySelector('.splash-game__score')?.textContent).toMatch(/score 0/i);

    await act(async () => root.unmount());
  });
});
