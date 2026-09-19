// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeroPromptSection } from './HeroPromptSection.js';
import i18n from './i18n/index.js';

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('HeroPromptSection busy states and loading indicators', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders progress bar and button busy state when refining or submitting', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const renderWithStatus = async (submissionStatus: 'idle' | 'refining' | 'loading') => {
      await act(async () => {
        root.render(
          createElement(HeroPromptSection, {
            initialPrompt: 'Lets create a remake of Beasts and Pumpkins game',
            catalogEntries: [],
            submissionStatus,
            submissionError: null,
            onSubmitSpec: vi.fn(),
          }),
        );
        await flushEffects();
      });
    };

    await renderWithStatus('refining');
    expect(container.querySelector('.prompt-busy-progress-bar')).not.toBeNull();
    expect(container.querySelector('.build-match-btn.is-busy')).not.toBeNull();
    expect(container.querySelector('.build-match-btn .build-btn-spinner')).not.toBeNull();
    expect(container.querySelector('.build-match-btn')?.textContent).toMatch(/Analyzing your idea/i);

    await renderWithStatus('loading');
    expect(container.querySelector('.prompt-busy-progress-bar')).not.toBeNull();
    expect(container.querySelector('.build-match-btn.is-busy')).not.toBeNull();
    expect(container.querySelector('.build-match-btn')?.textContent).toMatch(/Submitting/i);

    await renderWithStatus('idle');
    expect(container.querySelector('.prompt-busy-progress-bar')).toBeNull();
    expect(container.querySelector('.build-match-btn.is-busy')).toBeNull();

    await act(async () => root.unmount());
  });

  it('rotates analyzing status steps over time while refining', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(HeroPromptSection, {
          initialPrompt: 'Lets create a remake of Beasts and Pumpkins game',
          catalogEntries: [],
          submissionStatus: 'refining',
          submissionError: null,
          onSubmitSpec: vi.fn(),
        }),
      );
      await flushEffects();
    });

    expect(container.querySelector('.prompt-busy-status')?.textContent).toMatch(/Analyzing your idea/i);
    expect(container.querySelector('.build-match-btn')?.textContent).toMatch(/Analyzing your idea/i);

    // Advance 2.8s: step 2
    await act(async () => {
      vi.advanceTimersByTime(2800);
      await flushEffects();
    });
    expect(container.querySelector('.prompt-busy-status')?.textContent).toMatch(/Exploring gameplay mechanics/i);
    expect(container.querySelector('.build-match-btn')?.textContent).toMatch(/Exploring gameplay mechanics/i);

    // Advance another 2.8s: step 3
    await act(async () => {
      vi.advanceTimersByTime(2800);
      await flushEffects();
    });
    expect(container.querySelector('.prompt-busy-status')?.textContent).toMatch(/Formulating design questions/i);
    expect(container.querySelector('.build-match-btn')?.textContent).toMatch(/Formulating design questions/i);

    // Advance another 2.8s: step 4 (final step, interval is cleared)
    await act(async () => {
      vi.advanceTimersByTime(2800);
      await flushEffects();
    });
    expect(container.querySelector('.prompt-busy-status')?.textContent).toMatch(/Almost ready/i);
    expect(container.querySelector('.build-match-btn')?.textContent).toMatch(/Almost ready/i);

    // Advancing further stays on final step
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await flushEffects();
    });
    expect(container.querySelector('.prompt-busy-status')?.textContent).toMatch(/Almost ready/i);

    await act(async () => root.unmount());
  });
});
