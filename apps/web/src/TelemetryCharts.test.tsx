// @vitest-environment jsdom

import { act, createElement, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Gauge, Histogram, LineChart, OpenGauge } from './TelemetryCharts.js';

/**
 * Chart primitives must not invent confidence: a null rate is a dash, an empty
 * distribution is an empty message — never a drawn zero that looks measured.
 */

function render(node: ReactElement): { host: HTMLElement; root: ReturnType<typeof createRoot> } {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return { host, root };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Gauge', () => {
  it('exposes the formatted value and label to assistive tech', () => {
    const { host, root } = render(createElement(Gauge, { value: 0.27, display: '27%', label: 'reached a game' }));
    const svg = host.querySelector('svg[role="img"]');
    expect(svg?.getAttribute('aria-label')).toBe('reached a game: 27%');
    expect(host.textContent).toContain('27%');
    expect(host.textContent).toContain('reached a game');
    act(() => {
      root.unmount();
    });
  });

  it('draws no fill and marks itself empty when there is no evidence', () => {
    const { host, root } = render(createElement(Gauge, { value: null, display: '—', label: 'creator D7 return' }));
    expect(host.querySelector('.telem-gauge')?.classList.contains('is-empty')).toBe(true);
    expect(host.querySelector('.telem-gauge-fill')).toBeNull();
    expect(host.textContent).toContain('—');
    act(() => {
      root.unmount();
    });
  });
});

describe('OpenGauge', () => {
  it('keeps the goal tick even when the reading overshoots the base scale', () => {
    const { host, root } = render(
      createElement(OpenGauge, {
        value: 4.94,
        display: '4.94',
        label: 'growth k',
        max: 5,
        goal: 1,
      }),
    );
    expect(host.querySelector('.telem-gauge-target')).not.toBeNull();
    expect(host.textContent).toContain('4.94');
    act(() => {
      root.unmount();
    });
  });
});

describe('Histogram', () => {
  it('renders one column per bucket with the count visible', () => {
    const { host, root } = render(
      createElement(Histogram, {
        title: 'Time to first play',
        bars: [
          { label: '≤10s', value: 291 },
          { label: '≤30s', value: 144 },
          { label: '≤1m', value: 37 },
        ],
      }),
    );
    expect(host.textContent).toContain('Time to first play');
    expect(host.textContent).toContain('291');
    expect(host.textContent).toContain('≤10s');
    expect(host.querySelectorAll('.telem-histogram-col')).toHaveLength(3);
    act(() => {
      root.unmount();
    });
  });

  it('says so plainly when every bucket is empty', () => {
    const { host, root } = render(
      createElement(Histogram, {
        title: 'Games per visit',
        bars: [],
        emptyMessage: 'No visit reached a game.',
      }),
    );
    expect(host.textContent).toContain('No visit reached a game.');
    expect(host.querySelector('.telem-histogram-plot')).toBeNull();
    act(() => {
      root.unmount();
    });
  });
});

describe('LineChart', () => {
  const series = [
    { id: 'visits', label: 'Visits', color: '#00e4ac', values: [10, 20, 30] },
    { id: 'plays', label: 'Plays', color: '#38bdf8', values: [4, 8, 12] },
    { id: 'creations', label: 'Creations', color: '#fbbf24', values: [1, 0, 2], axis: 'right' as const },
  ];

  it('toggles a series off when its legend button is clicked', () => {
    const { host, root } = render(
      createElement(LineChart, {
        title: 'Visits & plays',
        labels: ['08-01', '08-02', '08-03'],
        series,
      }),
    );
    expect(host.querySelectorAll('.telem-line-path')).toHaveLength(3);
    const visitsBtn = Array.from(host.querySelectorAll('button.telem-line-legend-btn')).find((btn) =>
      btn.textContent?.includes('Visits'),
    );
    expect(visitsBtn).toBeTruthy();
    act(() => {
      visitsBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(host.querySelectorAll('.telem-line-path')).toHaveLength(2);
    expect(visitsBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(visitsBtn?.classList.contains('is-off')).toBe(true);
    act(() => {
      root.unmount();
    });
  });

  it('shows a tooltip for the nearest day on hover', () => {
    const { host, root } = render(
      createElement(LineChart, {
        title: 'Visits & plays',
        labels: ['08-01', '08-02', '08-03'],
        series,
      }),
    );
    const svg = host.querySelector('svg.telem-line-svg');
    expect(svg).not.toBeNull();
    // jsdom lacks layout — stub the SVG box for hover math.
    Object.defineProperty(svg, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        width: 640,
        height: 200,
        right: 640,
        bottom: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    act(() => {
      // hasRight → pad.right 40; plot mid-point maps to the second label.
      svg?.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          clientX: 40 + (640 - 40 - 40) / 2,
          clientY: 100,
        }),
      );
    });
    const tooltip = host.querySelector('.telem-line-tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip?.textContent).toContain('08-02');
    expect(tooltip?.textContent).toContain('Visits');
    expect(tooltip?.textContent).toContain('20');
    expect(host.querySelector('.telem-line-crosshair')).not.toBeNull();
    act(() => {
      root.unmount();
    });
  });
});
