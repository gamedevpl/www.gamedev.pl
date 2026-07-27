// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mascot, MascotMoment, type MascotEmotion } from './Mascot';

const EMOTIONS: MascotEmotion[] = [
  'idle',
  'happy',
  'curious',
  'thinking',
  'excited',
  'confused',
  'sad',
  'proud',
  'wave',
  'busy',
];

describe('Mascot', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders an accessible SVG when given a title', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(Mascot, { title: 'Gamedev.pl mascot', emotion: 'happy', size: 48 }));
    });

    const svg = container.querySelector('svg.mascot');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Gamedev.pl mascot');
    expect(svg?.classList.contains('mascot--happy')).toBe(true);
    expect(container.querySelector('mask')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('is presentational when untitled', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(Mascot, { emotion: 'idle' }));
    });

    const svg = container.querySelector('svg.mascot');
    expect(svg?.getAttribute('role')).toBe('presentation');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');

    await act(async () => {
      root.unmount();
    });
  });

  it.each(EMOTIONS)('draws emotion "%s" without throwing', async (emotion) => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(Mascot, { emotion, size: 32 }));
    });

    expect(container.querySelector(`.mascot--${emotion}`)).not.toBeNull();
    expect(container.querySelector('svg.mascot')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('wraps copy in MascotMoment', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(MascotMoment, { emotion: 'confused' }, createElement('p', null, 'Lost the plot')),
      );
    });

    expect(container.querySelector('.mascot-moment')).not.toBeNull();
    expect(container.querySelector('.mascot--confused')).not.toBeNull();
    expect(container.textContent).toContain('Lost the plot');

    await act(async () => {
      root.unmount();
    });
  });
});
