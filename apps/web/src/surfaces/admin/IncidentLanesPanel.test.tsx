// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { CreationLimits } from './adminApi.js';
import { IncidentLanesPanel } from './IncidentLanesPanel.js';

function effective(overrides: Partial<CreationLimits['effective']> = {}): CreationLimits['effective'] {
  return {
    paused: false,
    globalDailySubmissionCap: 50,
    managedBuilderMode: 'auto',
    managedDailyCap: null,
    managedDailyUserCap: null,
    hasPlatformBackend: true,
    managedAgentVendor: { stored: null, effective: null, available: false, configuredVendors: [], defaultVendor: null },
    tabCompletePaused: false,
    globalDailyTabCompleteTokenCap: 2_000_000,
    seedingMode: 'auto',
    seedProvider: {
      stored: null,
      effective: 'vertex',
      available: true,
      configuredProviders: ['vertex'],
      defaultProvider: 'vertex',
    },
    ...overrides,
  };
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((el) => el.textContent === label);
  if (!found) throw new Error(`no button "${label}"`);
  return found;
}

async function render(props: Parameters<typeof IncidentLanesPanel>[0]) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(IncidentLanesPanel, props)));
  return { container, root };
}

describe('IncidentLanesPanel', () => {
  it('gives every lane the brake can pull a way back out', async () => {
    const onToggle = vi.fn();
    const { container, root } = await render({
      effective: effective({ searchPaused: true }),
      busy: false,
      message: null,
      propagation: '60s',
      onToggle,
    });

    // The brake pauses these four; the console used to show only creation.
    expect(button(container, 'Pause editing')).toBeTruthy();
    expect(button(container, 'Pause chat')).toBeTruthy();
    expect(button(container, 'Pause gate runs')).toBeTruthy();
    expect(container.querySelector('.health-summary')?.textContent).toBe('Paused: search.');

    await act(async () => button(container, 'Resume search').click());
    expect(onToggle).toHaveBeenCalledWith({ searchPaused: false });

    await act(async () => root.unmount());
  });

  it('reads an absent flag as open, so old responses render', async () => {
    const { container, root } = await render({
      effective: effective(),
      busy: true,
      message: 'Applied.',
      propagation: '60s',
      onToggle: vi.fn(),
    });

    expect(container.querySelector('.health-summary')?.textContent).toBe('Every lane is open.');
    expect(button(container, 'Pause chat').disabled).toBe(true);
    expect(container.querySelector('.admin-limits-message')?.textContent).toBe('Applied.');

    await act(async () => root.unmount());
  });
});
