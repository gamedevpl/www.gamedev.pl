// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ReportGameButton } from './ReportGameButton.js';
import { CONTACT_EMAIL } from './legal/operator.js';
import i18n from './i18n/index.js';

/**
 * This control is our DSA art. 16 notice-and-action mechanism. A notice only obliges
 * us to act if it is precise enough to act on, so the four elements the article names
 * — why it is illegal, where it is, who is reporting, and a good-faith statement —
 * have to be in the message the reporter is handed. An empty mailto would technically
 * be "a way to contact us" and would practically produce unactionable reports.
 */

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  // Unmount before removing the host — otherwise React can still commit after jsdom
  // tears the environment down and Vitest fails the suite with "window is not defined"
  // even though every assertion already passed.
  act(() => {
    root?.unmount();
  });
  root = null;
  container.remove();
});

function draw(slug: string, title: string) {
  root = createRoot(container);
  act(() => {
    root!.render(<ReportGameButton slug={slug} title={title} />);
  });
  const link = container.querySelector('a')!;
  const href = link.getAttribute('href')!;
  const [, query] = href.split('?');
  const params = new URLSearchParams(query);
  return { link, href, body: params.get('body') ?? '', subject: params.get('subject') ?? '' };
}

describe('ReportGameButton', () => {
  it('addresses the report to the published contact point', () => {
    const { href } = draw('space-dash', 'Space Dash');
    expect(href.startsWith(`mailto:${CONTACT_EMAIL}?`)).toBe(true);
  });

  it('renders as a theater secondary control rather than a muted ghost link', () => {
    const { link } = draw('space-dash', 'Space Dash');
    expect(link.classList.contains('report-btn')).toBe(true);
    expect(link.classList.contains('secondary-btn')).toBe(true);
  });

  it('pre-fills all four elements a valid notice needs', () => {
    const { body } = draw('space-dash', 'Space Dash');
    // Where the content is — the one element the reporter should never have to look up.
    expect(body).toContain('https://www.gamedev.pl/play/space-dash');
    expect(body).toContain('Space Dash (space-dash)');
    // Why it is illegal, and who is reporting.
    expect(body).toMatch(/why i believe this content is illegal/i);
    expect(body).toMatch(/my name and email address/i);
    // The good-faith statement art. 16(2)(d) requires.
    expect(body).toMatch(/good faith/i);
  });

  it('identifies the game in the subject so reports can be triaged', () => {
    const { subject } = draw('brick-storm', 'Brick Storm');
    expect(subject).toContain('Brick Storm');
    expect(subject).toContain('brick-storm');
  });

  it('reports in the language the reporter is reading', async () => {
    await i18n.changeLanguage('pl');
    const { body, subject } = draw('space-dash', 'Space Dash');
    expect(subject).toMatch(/zgłoszenie nielegalnych treści/i);
    expect(body).toMatch(/w dobrej wierze/i);
  });

  it('escapes a title that would otherwise break the mailto query', () => {
    const { subject, href } = draw('odd-one', 'Tom & Jerry? #1');
    expect(subject).toContain('Tom & Jerry? #1');
    // The raw characters must not leak into the URL and truncate the body after them.
    expect(href).not.toContain('& Jerry');
    expect(href).toContain('%26');
  });
});
