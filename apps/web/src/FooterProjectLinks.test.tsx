// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import { FooterProjectLinks, X_URL, YOUTUBE_URL } from './FooterProjectLinks.js';
import './i18n/index.js';

describe('FooterProjectLinks', () => {
  it('links to the YouTube channel and the X profile in a new tab', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(<FooterProjectLinks />));

    for (const href of [YOUTUBE_URL, X_URL]) {
      const link = [...container.querySelectorAll('a')].find((a) => a.href === href);
      expect(link?.target).toBe('_blank');
      expect(link?.rel).toContain('noopener');
    }
    act(() => root.unmount());
  });
});
