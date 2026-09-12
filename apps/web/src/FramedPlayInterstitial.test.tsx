// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { FramedPlayInterstitial } from './FramedPlayInterstitial.js';
import i18n from './i18n/index.js';

async function renderInterstitial(slug: string) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(FramedPlayInterstitial, { slug }));
  });
  return { container, root };
}

describe('FramedPlayInterstitial', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    window.history.pushState(null, '', '/');
  });

  it('offers a new-window link and a top-level fallback, never the theater', async () => {
    const { container, root } = await renderInterstitial('unicorn-snap');
    const links = [...container.querySelectorAll('a')];
    const openNew = links.find((link) => link.getAttribute('target') === '_blank');
    const openHere = links.find((link) => link.getAttribute('target') === '_top');
    expect(openNew?.getAttribute('href')).toBe('/play/unicorn-snap');
    expect(openNew?.getAttribute('rel')).toBe('noopener');
    expect(openHere?.getAttribute('href')).toBe('/play/unicorn-snap');
    expect(container.querySelector('.stage')).toBeNull();
    expect(container.textContent).toMatch(/new window/i);
    root.unmount();
  });

  it('keeps the visit-stream UTM fields on both handoff links', async () => {
    window.history.pushState(null, '', '/play/unicorn-snap?utm_source=JS13k&utm_medium=embed&utm_term=drop&foo=1');
    const { container, root } = await renderInterstitial('unicorn-snap');
    const hrefs = [...container.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual([
      '/play/unicorn-snap?utm_source=js13k&utm_medium=embed',
      '/play/unicorn-snap?utm_source=js13k&utm_medium=embed',
    ]);
    root.unmount();
  });
});
