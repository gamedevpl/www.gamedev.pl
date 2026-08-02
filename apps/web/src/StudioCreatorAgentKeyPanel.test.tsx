// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import './i18n/index.js';
import { StudioCreatorAgentKeyPanel } from './StudioCreatorAgentKeyPanel.js';

const FULL_KEY = 'YzEu' + 'a'.repeat(100);

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('StudioCreatorAgentKeyPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('renders a masked header and never puts the full key in the markup', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          key: FULL_KEY,
          keyGeneration: 1,
          expiresAt: Math.floor(Date.now() / 1000) + 86400,
          fingerprint: '9a10e',
          authorizationHeader: `Authorization: Bearer ${FULL_KEY}`,
          authorizationHeaderMasked: 'Authorization: Bearer ····9a10e',
        }),
      })),
    );

    await act(async () => {
      root.render(createElement(StudioCreatorAgentKeyPanel));
    });
    await act(async () => {
      await flush();
    });

    const markup = container.innerHTML;
    expect(markup).toContain('Authorization: Bearer ····9a10e');
    expect(markup).not.toContain(FULL_KEY);
    expect(markup).not.toContain(`Bearer ${FULL_KEY}`);
    expect(container.querySelector('[data-testid="creator-key-masked"]')?.textContent).toBe(
      'Authorization: Bearer ····9a10e',
    );
  });
});
