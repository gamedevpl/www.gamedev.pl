// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { AuthProvider } from './AuthContext.js';
import { clearPendingQa, savePendingQa } from './pendingQa.js';

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('App QA session discard with restored prompt', () => {
  afterEach(() => {
    clearPendingQa();
    vi.restoreAllMocks();
  });

  it('restores pending spec concept into the prompt input when discarding session', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    savePendingQa({
      spec: {
        concept: 'Survive in a radioactive forest',
        title: 'Toxic Woods',
        displayName: 'Night Shift',
      },
      questions: [
        {
          id: 'q1',
          question: 'Visual style?',
          options: [{ label: 'Pixel' }],
        },
      ],
      answers: { selected: { q1: ['Pixel'] }, custom: {} },
      locale: 'en',
      builder: 'platform',
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        return new Response(JSON.stringify({ user: { uid: 'g:test', tier: 'standard' } }));
      }
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: false }));
      }
      if (url.endsWith('/api/catalog')) return new Response(JSON.stringify([]));
      if (url.includes('/api/recommendations')) return new Response(JSON.stringify({ items: [] }));
      if (url.includes('/api/quota')) {
        return new Response(JSON.stringify({ submissions: { used: 0, limit: 5 } }));
      }
      if (url.includes('/api/submissions/mine')) return new Response(JSON.stringify({ submissions: [] }));
      return new Response(JSON.stringify({}), { status: 404 });
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(AuthProvider, null, createElement(App)));
      await flushEffects();
      await flushEffects();
    });

    // CreatorQA is mounted because pendingSpec was restored from localStorage
    const exitBtn = document.querySelector<HTMLButtonElement>('.qa-wizard-exit')!;
    expect(exitBtn).not.toBeNull();

    await act(async () => {
      exitBtn.click();
      await flushEffects();
    });

    // Modal opens, click discard & exit
    const discardBtn = document.querySelector<HTMLButtonElement>('.qa-confirm-discard')!;
    expect(discardBtn).not.toBeNull();

    await act(async () => {
      discardBtn.click();
      await flushEffects();
      await flushEffects();
    });

    // Wizard unmounts and prompt input is repopulated with restored concept
    const promptInput = container.querySelector<HTMLInputElement>('.big-prompt-input');
    expect(promptInput?.value).toBe('Survive in a radioactive forest');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
