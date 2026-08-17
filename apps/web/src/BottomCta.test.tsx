// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomCta } from './BottomCta.js';
import i18n from './i18n/index.js';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  container = document.createElement('div');
  document.body.appendChild(container);
  if (!Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')) {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: () => {}, writable: true });
  }
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('BottomCta', () => {
  it('scrolls the composer into view when the action is pressed', () => {
    const composer = document.createElement('div');
    composer.id = 'hero-prompt';
    document.body.appendChild(composer);
    const scrollIntoView = vi.fn();
    composer.scrollIntoView = scrollIntoView;

    root = createRoot(container);
    act(() => {
      root!.render(createElement(BottomCta));
    });

    expect(container.textContent).toContain('Have your own idea?');
    act(() => {
      container.querySelector<HTMLButtonElement>('.bottom-cta-action')!.click();
    });
    expect(scrollIntoView).toHaveBeenCalled();

    composer.remove();
  });

  it('does nothing when the composer is not on the page', () => {
    root = createRoot(container);
    act(() => {
      root!.render(createElement(BottomCta));
    });

    expect(() => {
      act(() => {
        container.querySelector<HTMLButtonElement>('.bottom-cta-action')!.click();
      });
    }).not.toThrow();
  });
});
