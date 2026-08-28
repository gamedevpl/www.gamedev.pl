// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SiteFooter } from './SiteFooter.js';
import i18n from './i18n/index.js';
import { setVisitSessionForTesting, VisitSession } from './visitTelemetry.js';

/**
 * The footer carries two different reporting routes that look alike and must not be
 * confused: "report illegal content" is the legal notice-and-action path, and "report a
 * bug" goes to the issue tracker. Contact opens the in-app form that emails the operator;
 * the electronic address also lives in the legal documents, not under the brand. These
 * check that the project links are present and that the bug link carries the visit id,
 * which is what lets a public issue be diagnosed without anyone pasting session details
 * into it.
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
    expect(repoLink?.rel).toContain('noopener');
    // Repo mark lives in the footer now — not the header chrome.
    expect(repoLink?.classList.contains('site-footer__github')).toBe(true);
    expect(repoLink?.querySelector('img')).not.toBeNull();
    expect(links().some((a) => a.getAttribute('href') === '/cli')).toBe(true);
  });

  it('sends Contact to the in-app form, not GitHub issues or a bare mailto', () => {
    render();

    const contact = links().find((a) => a.getAttribute('href') === '/contact');
    expect(contact).toBeDefined();

    // Contact must not be the issues list. The only /issues link left is "report a
    // bug" (…/issues/new?…). Parse the URL so we match the host and path precisely —
    // a substring check on "github.com" trips CodeQL's incomplete-sanitization rule.
    const issueListLinks = links().filter((a) => {
      try {
        const url = new URL(a.href);
        return url.hostname === 'github.com' && url.pathname === '/gamedevpl/www.gamedev.pl/issues';
      } catch {
        return false;
      }
    });
    expect(issueListLinks).toHaveLength(0);
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
