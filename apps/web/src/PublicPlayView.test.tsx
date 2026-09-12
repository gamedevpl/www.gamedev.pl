// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicPlayView } from './PublicPlayView.js';

vi.mock('./GameTheater.js', () => ({
  GameTheater: (props: { onExit: () => void }) =>
    createElement('button', { className: 'exit-btn', onClick: props.onExit }, 'Close'),
}));

describe('PublicPlayView framed by js13k', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.classList.remove('is-framed-play');
    vi.restoreAllMocks();
  });

  it('no-ops Close and marks the document when a foreign frame hosts play', async () => {
    const parent = {} as Window;
    Object.defineProperty(window, 'parent', { configurable: true, value: parent });
    const onExit = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(PublicPlayView, { slug: 'unicorn-snap', onExit }));
    });
    expect(document.documentElement.classList.contains('is-framed-play')).toBe(true);
    await act(async () => {
      container.querySelector('.exit-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onExit).not.toHaveBeenCalled();
    root.unmount();
    Object.defineProperty(window, 'parent', { configurable: true, value: window });
  });
});
