// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { renderInline } from './inline.js';

/**
 * The documents promise contact addresses and cross-references in several places. If
 * this parser drops a link, a user reading the privacy policy loses the one route to
 * exercising the rights it describes.
 */

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
});

function draw(text: string) {
  act(() => {
    createRoot(container).render(<p>{renderInline(text)}</p>);
  });
  return {
    links: Array.from(container.querySelectorAll('a')),
    text: container.textContent ?? '',
  };
}

describe('renderInline', () => {
  it('renders a mailto link without leaving the tab, keeping the surrounding text', () => {
    const { links, text } = draw('Write to [admin@gamedev.pl](mailto:admin@gamedev.pl) about it.');
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute('href')).toBe('mailto:admin@gamedev.pl');
    expect(links[0]!.hasAttribute('target')).toBe(false);
    expect(text).toBe('Write to admin@gamedev.pl about it.');
  });

  it('opens external references in a new tab, safely', () => {
    const { links } = draw('See [uodo.gov.pl](https://uodo.gov.pl).');
    expect(links[0]!.getAttribute('target')).toBe('_blank');
    expect(links[0]!.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('keeps in-app routes in the tab', () => {
    const { links } = draw('See the [Polityka prywatności](/privacy).');
    expect(links[0]!.getAttribute('href')).toBe('/privacy');
    expect(links[0]!.hasAttribute('target')).toBe(false);
  });

  it('handles several links in one paragraph', () => {
    const { links, text } = draw('[a](/terms) and [b](/privacy) and [c](mailto:x@y.z)');
    expect(links.map((link) => link.textContent)).toEqual(['a', 'b', 'c']);
    expect(text).toBe('a and b and c');
  });

  it('passes plain text through untouched', () => {
    const { links, text } = draw('No markup here at all.');
    expect(links).toHaveLength(0);
    expect(text).toBe('No markup here at all.');
  });
});
