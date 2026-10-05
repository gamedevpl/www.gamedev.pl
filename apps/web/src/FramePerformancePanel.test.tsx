// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import type { FramePerformanceGroup } from '@gamedevpl/contract';
import { FramePerformancePanel } from './FramePerformancePanel.js';

const row: FramePerformanceGroup = {
  slug: 'biplane-skirmish',
  artifactVersion: 'a'.repeat(64),
  reviewer: true,
  device: {
    deviceClass: 'desktop',
    system: 'macos',
    browser: 'chrome',
    browserMajor: 154,
    screenWidth: 1710,
    screenHeight: 1107,
    displayDpr: 2,
    cpuBucket: 8,
    memoryBucket: 8,
  },
  viewportWidth: 1650,
  viewportHeight: 986,
  canvasCssWidth: 1650,
  canvasCssHeight: 986,
  canvasWidth: 3300,
  canvasHeight: 1972,
  dpr: 2,
  orientation: 'landscape',
  state: 'playing',
  gfxBackend: 'webgl3d',
  sessions: 2,
  windows: 4,
  observedMs: 20000,
  rafFps: 60,
  renderedFps: null,
  p95GapUpperMs: 34,
  p99GapUpperMs: null,
  maxGapMs: 1200,
  gapsOver100Ms: 2,
  gapsOver250Ms: 1,
  intervals: [4, 0, 0, 0, 0, 0, 0, 1],
};

it('pages device groups, filters all pages by game and preserves context in details', async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const groups = [...Array.from({ length: 12 }, (_, i) => ({ ...row, slug: `game-${i}` })), row];
  const report = { groups, measuredSessions: 26, unmeasuredSessions: 5, truncated: true };
  try {
    await act(async () => root.render(<FramePerformancePanel report={report} />));
    expect(container.querySelectorAll('tbody tr')).toHaveLength(10);
    expect(container.textContent).toContain('Page 1 of 2');
    const click = async (text: string) =>
      act(async () => {
        [...container.querySelectorAll('button')].find((node) => node.textContent === text)!.click();
      });
    await click('Next');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(container.textContent).toContain('biplane-skirmish');
    const filter = container.querySelector('select')!;
    await act(async () => {
      filter.value = row.slug;
      filter.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(container.textContent).toContain('Page 1 of 1');
    expect([...container.querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
    const cells = [...container.querySelectorAll('tbody td')];
    expect(cells[2].textContent).toBe('60.0');
    expect(cells[3].textContent).toBe('—');
    expect(container.textContent).toContain('Reviewer');
    expect(container.textContent).toContain('1650×986');
    expect(container.textContent).toContain('3300×1972');
    expect(container.textContent).toContain('1710×1107');
    expect(container.textContent).toContain('34 ms / >1000 ms');
    expect(container.textContent).toContain('Max 1200 ms');
    expect(container.textContent).toContain('results are incomplete');
    await act(async () => root.render(<FramePerformancePanel report={{ ...report, groups: [groups[0]] }} />));
    expect(container.querySelector('select')!.value).toBe('');
    expect(container.textContent).toContain('game-0');
  } finally {
    await act(async () => root.unmount());
  }
});
