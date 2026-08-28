// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SuggestionsPanel } from './SuggestionsPanel.js';
import type { Suggestion } from './adminApi.js';

const mocked = vi.hoisted(() => ({
  fetchAdminSummary: vi.fn(),
  fetchCreationLimits: vi.fn(),
  setCreationLimits: vi.fn(),
  fetchSuggestions: vi.fn(),
  fetchAccessTokens: vi.fn(),
  mintAccessToken: vi.fn(),
  revokeAccessToken: vi.fn(),
}));

vi.mock('./adminApi.js', () => mocked);

function suggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    slug: 'comet-courier',
    class: 'defect',
    priority: 3.5,
    evidence: [{ finding: 'One in three sessions ends in an uncaught error.', metrics: { errors: 12 } }],
    untrustedContext: { errorSamples: [], progressLabels: [], feedbackThemes: [] },
    computedFrom: '2026-07-30T02:00:00Z',
    ...overrides,
  };
}

async function render() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(SuggestionsPanel));
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('SuggestionsPanel', () => {
  it('counts what is actionable, and shows the rest as context', async () => {
    // A game the router passed over is still listed: silence has to be legible, or a
    // router that stopped routing looks exactly like a catalog with no problems.
    mocked.fetchSuggestions.mockResolvedValue({
      suggestions: [
        suggestion(),
        suggestion({ slug: 'brick-storm', class: 'healthy' }),
        suggestion({ slug: 'sky-dodge', class: 'insufficient-data' }),
      ],
      computedFrom: '2026-07-30T02:00:00Z',
    });

    const { container, root } = await render();

    expect(container.querySelector('.health-summary')?.textContent).toBe('1 of 3 games have something to look at.');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3);

    await act(async () => root.unmount());
  });

  it('carries player- and game-written text as text, beside the numbers', async () => {
    mocked.fetchSuggestions.mockResolvedValue({
      suggestions: [
        suggestion({
          untrustedContext: {
            errorSamples: [{ message: 'TypeError: undefined is not a function', count: 4 }],
            progressLabels: [],
            feedbackThemes: [{ theme: 'too hard', count: 2 }],
          },
        }),
      ],
      computedFrom: '2026-07-30T02:00:00Z',
    });

    const { container, root } = await render();

    const disclosure = container.querySelector('.health-disclosure');
    expect(disclosure?.querySelector('summary')?.textContent).toBe('2');
    expect(disclosure?.textContent).toContain('TypeError: undefined is not a function');
    expect(disclosure?.textContent).toContain('too hard');

    await act(async () => root.unmount());
  });

  it('says a stale answer is stale rather than letting it read as current', async () => {
    mocked.fetchSuggestions.mockResolvedValue({ suggestions: [], computedFrom: null });

    const { container, root } = await render();

    expect(container.querySelector('.health-note')?.textContent).toContain('which has never run');

    await act(async () => root.unmount());
  });

  it('tells a non-operator nothing', async () => {
    mocked.fetchSuggestions.mockResolvedValue(null);

    const { container, root } = await render();

    expect(container.textContent).toBe('Not found.');

    await act(async () => root.unmount());
  });
});
