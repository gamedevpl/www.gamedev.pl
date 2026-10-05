// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { GameHealthView } from './GameHealthView.js';
import * as api from './healthApi.js';

it('hides stale performance during loading and failure, then shows the replacement window', async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const response = (measuredSessions: number): api.HealthResponse => ({
    days: ['2026-07-25'],
    truncated: false,
    games: [],
    performance: { groups: [], truncated: false, measuredSessions, unmeasuredSessions: 0 },
  });
  const health = vi.spyOn(api, 'fetchGameHealth').mockResolvedValue(response(7));
  vi.spyOn(api, 'fetchVisitFunnel').mockResolvedValue(null);
  vi.spyOn(api, 'fetchCreatorMetrics').mockResolvedValue(null);
  vi.spyOn(api, 'fetchScorecards').mockResolvedValue(null);
  vi.spyOn(api, 'fetchTelemetryTrends').mockResolvedValue(null);
  const selectWindow = async (label: string) => {
    const button = [...container.querySelectorAll('button')].find((node) => node.textContent === label);
    expect(button).toBeDefined();
    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };
  try {
    await act(async () => root.render(<GameHealthView />));
    await selectWindow('Performance');
    expect(container.textContent).toContain('7 measured sessions');

    let rejectRequest!: (error: Error) => void;
    health.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      }),
    );
    await selectWindow('30d');
    expect(container.textContent).toContain('Reading telemetry');
    expect(container.textContent).not.toContain('Frame performance by device');
    expect(container.textContent).not.toContain('7 measured sessions');

    await act(async () => rejectRequest(new Error('Window request failed')));
    expect(container.textContent).toContain('Could not read telemetry');
    expect(container.textContent).not.toContain('Frame performance by device');

    health.mockResolvedValue(response(1));
    await selectWindow('1d');
    expect(container.textContent).toContain('1 measured sessions');
    expect(container.textContent).not.toContain('7 measured sessions');
    const cohort = container.querySelector('select');
    expect(cohort).not.toBeNull();
    await act(async () => {
      cohort!.value = 'only';
      cohort!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(health).toHaveBeenLastCalledWith(1, 'only');
  } finally {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    container.remove();
  }
});
