// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreatorQA } from './CreatorQA.js';
import i18n from './i18n/index.js';

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

async function click(element: HTMLElement | null) {
  if (!element) throw new Error('element is null');
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushEffects();
  });
}

describe('CreatorQA submitting state', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const baseProps = {
    questions: [],
    initialConcept: 'A retro arcade racer',
    initialTitle: 'Micro Overdrive',
    onSubmitWithConcept: vi.fn(),
  };

  it('renders submitting card and rotates status steps over time while submitting', async () => {
    vi.useFakeTimers();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const props = {
      ...baseProps,
      questions: [{ id: 'q1', question: 'Art style?', options: [{ label: 'Pixel' }] }],
    };

    await act(async () => {
      root.render(createElement(CreatorQA, props as never));
      await flushEffects();
    });

    const find = <T extends HTMLElement = HTMLElement>(sel: string) =>
      (document.querySelector(sel) as T | null) ?? (container.querySelector(sel) as T | null);

    await click(find('.qa-shortcut'));
    expect(find('.btn-create-now')).not.toBeNull();

    await act(async () => {
      root.render(createElement(CreatorQA, { ...props, submitting: true } as never));
      await flushEffects();
    });

    expect(find('.qa-submitting-card')).not.toBeNull();
    expect(find('.qa-submitting-card__step-text')?.textContent).toMatch(/Submitting game specification/i);
    expect(find('.btn-create-now')?.textContent).toContain('Submitting');

    // Advance 2.8s: step 2
    await act(async () => {
      vi.advanceTimersByTime(2800);
      await flushEffects();
    });
    expect(find('.qa-submitting-card__step-text')?.textContent).toMatch(/Reserving game name and address/i);

    // Advance 2.8s: step 3
    await act(async () => {
      vi.advanceTimersByTime(2800);
      await flushEffects();
    });
    expect(find('.qa-submitting-card__step-text')?.textContent).toMatch(/Preparing workspace for coding agent/i);

    // Advance 2.8s: step 4
    await act(async () => {
      vi.advanceTimersByTime(2800);
      await flushEffects();
    });
    expect(find('.qa-submitting-card__step-text')?.textContent).toMatch(/Finalizing and opening Studio/i);

    await act(async () => root.unmount());
  });
});
