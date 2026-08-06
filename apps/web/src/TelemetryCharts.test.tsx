// @vitest-environment jsdom

import { act, createElement, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Gauge, Histogram, OpenGauge } from './TelemetryCharts.js';

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
