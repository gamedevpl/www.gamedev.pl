// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateStepsList } from './CreateStepsList.js';
import { SETTLE_MS, SPARK_MS } from './create-step-play.js';
import i18n from './i18n/index.js';

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('CreateStepsList', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('passes a spark down the spine and wins a 1-2-3-4 combo', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    vi.useFakeTimers();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(CreateStepsList));
      await flushEffects();
    });

    const buttons = container.querySelectorAll<HTMLButtonElement>('.create-step-scene');
    expect(buttons).toHaveLength(4);
    expect(buttons[0]?.getAttribute('aria-label')).toMatch(/thinking/i);

    const copy = container.querySelectorAll<HTMLElement>('.create-step-body');
    await act(async () => {
      copy[2]?.click();
      vi.advanceTimersByTime(1);
    });
    const missRow = container.querySelector('.create-step.is-miss');
    expect(container.querySelector('.create-step-scene.is-miss .mascot--confused')).not.toBeNull();
    expect(missRow).not.toBeNull();
    expect(missRow?.querySelector('.create-step-title')?.textContent).toMatch(/play/i);
    expect(container.querySelector('.create-steps-list')?.getAttribute('data-combo-next')).toBe('0');

    await act(async () => {
      vi.advanceTimersByTime(SPARK_MS + SETTLE_MS + 20);
    });

    for (const index of [0, 1, 2, 3]) {
      await act(async () => {
        buttons[index]?.click();
      });
    }
    await act(async () => {
      vi.advanceTimersByTime(SPARK_MS * 3 + 1);
    });

    const list = container.querySelector('.create-steps-list');
    expect(list?.classList.contains('is-won')).toBe(true);
    expect(container.querySelectorAll('.create-steps-list.is-won .create-step')).toHaveLength(4);
    const catching = container.querySelector('.create-step.is-catching');
    expect(catching).not.toBeNull();
    expect(catching?.getAttribute('aria-current')).toBe('step');
    expect(catching?.querySelector('.mascot')).not.toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toMatch(/tiny build/i);
    expect(container.querySelector('.create-step-scene.is-qa .mascot--excited')).not.toBeNull();
    expect(container.querySelector('.create-step-scene.is-live .mascot--proud')).not.toBeNull();

    await act(async () => root.unmount());
  });
});
