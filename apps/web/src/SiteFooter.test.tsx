// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SiteFooter } from './SiteFooter';
import i18n from './i18n';
import { setVisitSessionForTesting, VisitSession } from './visitTelemetry';

/**
 * The footer carries two different reporting routes that look alike and must not be
 * confused: "report illegal content" is the legal notice-and-action path, and "report a
 * bug" goes to the issue tracker. Contact opens the issues list for general outreach;
 * the electronic address stays in the legal documents, not under the brand. These check
 * that the project links are present and that the bug link carries the visit id, which
 * is what lets a public issue be diagnosed without anyone pasting session details into it.
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
  act(() => {
    root?.unmount();
  });
  root = null;
  setVisitSessionForTesting(null);
  container.remove();
});

function render(): void {
  root = createRoot(container);
  act(() => {
    root!.render(<SiteFooter />);
  });
}

function links(): HTMLAnchorElement[] {
  return [...container.querySelectorAll('a')];
}

describe('SiteFooter project links', () => {
  it('links to the repository', () => {
    render();

    const repoLink = links().find((a) => a.href === 'https://github.com/gamedevpl/www.gamedev.pl');
    expect(repoLink).toBeDefined();
    // Leaving the site: opened in a new tab, and without handing over the referrer opener.
    expect(repoLink?.rel).toContain('noopener');
  });

  it('sends Contact to the GitHub issues list, not a mailto', () => {
    render();

    const contact = links().find((a) => a.href === 'https://github.com/gamedevpl/www.gamedev.pl/issues');
    expect(contact).toBeDefined();
    expect(contact?.rel).toContain('noopener');
    expect(links().some((a) => a.href.startsWith('mailto:'))).toBe(false);
    expect(container.textContent).not.toContain('admin@gamedev.pl');
  });

  it('prefills the bug report with the current visit id and page', () => {
    setVisitSessionForTesting(new VisitSession('visit-abc', Date.now(), () => {}));
    window.history.pushState({}, '', '/play/arena-tag');

    render();

    const bugLink = links().find((a) => a.href.includes('/issues/new'));
    expect(bugLink).toBeDefined();

    const url = new URL(bugLink!.href);
    expect(url.searchParams.get('template')).toBe('bug_report.yml');
    expect(url.searchParams.get('report-id')).toBe('visit-abc');
    expect(url.searchParams.get('where')).toBe('/play/arena-tag');
  });

  it('still offers the bug link when nothing is tracking the visit', () => {
    render();

    const bugLink = links().find((a) => a.href.includes('/issues/new'));
    expect(bugLink).toBeDefined();
    expect(new URL(bugLink!.href).searchParams.has('report-id')).toBe(false);
  });
});
