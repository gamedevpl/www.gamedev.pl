// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mascot, MascotMoment, type MascotEmotion } from './Mascot.js';
import { MASCOT_IDLE_SPANS, MASCOT_SOLID_SPANS } from './mascotSpans.js';

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

type Span = readonly [number, number, number];

function toGrid(spans: ReadonlyArray<Span>): boolean[][] {
  const grid = Array.from({ length: 60 }, () => Array<boolean>(70).fill(false));
  for (const [x, y, width] of spans) {
    for (let i = 0; i < width; i++) grid[y][x + i] = true;
  }
  return grid;
}

/** Enclosed empty regions — anything not reachable from the border. */
function enclosedHoles(grid: boolean[][]): Array<{ size: number; minX: number; maxX: number }> {
  const seen = Array.from({ length: 60 }, () => Array<boolean>(70).fill(false));
  const outside: Array<[number, number]> = [];
  for (let x = 0; x < 70; x++) {
    outside.push([x, 0], [x, 59]);
  }
  for (let y = 0; y < 60; y++) {
    outside.push([0, y], [69, y]);
  }
  const flood = (seeds: Array<[number, number]>) => {
    const queue = seeds.filter(([x, y]) => !grid[y][x] && !seen[y][x]);
    queue.forEach(([x, y]) => (seen[y][x] = true));
    const cells: Array<[number, number]> = [];
    while (queue.length) {
      const [cx, cy] = queue.pop()!;
      cells.push([cx, cy]);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < 70 && ny >= 0 && ny < 60 && !grid[ny][nx] && !seen[ny][nx]) {
          seen[ny][nx] = true;
          queue.push([nx, ny]);
        }
      }
    }
    return cells;
  };
  flood(outside); // mark everything reachable from outside
  const holes = [];
  for (let y = 0; y < 60; y++) {
    for (let x = 0; x < 70; x++) {
      if (!grid[y][x] && !seen[y][x]) {
        const cells = flood([[x, y]]);
        const xs = cells.map(([cx]) => cx);
        holes.push({ size: cells.length, minX: Math.min(...xs), maxX: Math.max(...xs) });
      }
    }
  }
  return holes;
}

describe('mascot spans', () => {
  // Regression: MASCOT_SOLID_SPANS used to miss 185 pixels, including inside the eye
  // and mouth areas it exists to fill. Every gap became a pinhole in the emotion mask
  // and a dark speck on the body. It must stay a superset of the idle silhouette.
  it('solid spans cover every idle pixel', () => {
    const idle = toGrid(MASCOT_IDLE_SPANS);
    const solid = toGrid(MASCOT_SOLID_SPANS);
    const missing: string[] = [];
    for (let y = 0; y < 60; y++) {
      for (let x = 0; x < 70; x++) {
        if (idle[y][x] && !solid[y][x]) missing.push(`${x},${y}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('solid spans leave only the two ear rings open', () => {
    const holes = enclosedHoles(toGrid(MASCOT_SOLID_SPANS));
    // Exactly two holes, one on each side — the ear rings. Anything else is a pinhole
    // that would show through an emotion as a speck.
    expect(holes).toHaveLength(2);
    expect(holes.some((h) => h.maxX < 35)).toBe(true);
    expect(holes.some((h) => h.minX > 35)).toBe(true);
  });

  it('idle spans keep the face open so the logo reads as the logo', () => {
    // eyes, mouth and both ear rings
    expect(enclosedHoles(toGrid(MASCOT_IDLE_SPANS))).toHaveLength(5);
  });
});

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
    expect(container.querySelector('.mascot__lids')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('draws a waving arm for wave and excited', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(Mascot, { emotion: 'wave', size: 48 }));
    });
    expect(container.querySelector('.mascot__wave-arm')).not.toBeNull();

    await act(async () => {
      root.render(createElement(Mascot, { emotion: 'idle', size: 48 }));
    });
    expect(container.querySelector('.mascot__wave-arm')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  // Regression: the body used to be one <rect> per span. Separate rects are
  // composited separately, so an antialiasing renderer left a seam on every row —
  // horizontal banding on the body, speckle once downscaled. One path fills solid.
  it('draws the body as a single path, not one rect per span', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    for (const emotion of ['idle', 'confused'] as MascotEmotion[]) {
      await act(async () => {
        root.render(createElement(Mascot, { emotion, size: 88 }));
      });
      // A handful of rects is fine (blink lids, the masked fill); hundreds is the bug.
      expect(container.querySelectorAll('rect').length, emotion).toBeLessThan(10);
    }

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
      root.render(createElement(MascotMoment, { emotion: 'confused' }, createElement('p', null, 'Lost the plot')));
    });

    expect(container.querySelector('.mascot-moment')).not.toBeNull();
    expect(container.querySelector('.mascot--confused')).not.toBeNull();
    expect(container.textContent).toContain('Lost the plot');

    await act(async () => {
      root.unmount();
    });
  });
});
