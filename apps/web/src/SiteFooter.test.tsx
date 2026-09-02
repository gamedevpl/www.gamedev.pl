// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SiteFooter } from './SiteFooter.js';
import i18n from './i18n/index.js';
import { setVisitSessionForTesting, VisitSession } from './visitTelemetry.js';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, json: async () => ({}) })),
  );
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  setVisitSessionForTesting(null);
  vi.unstubAllGlobals();
  container.remove();
});

async function render(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(<SiteFooter />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function links(): HTMLAnchorElement[] {
  return [...container.querySelectorAll('a')];
}

describe('SiteFooter project links', () => {
  it('links to the repository', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ enabled: true }) })),
    );
    await render();

    const repoLink = links().find((a) => a.href === 'https://github.com/gamedevpl/www.gamedev.pl');
    expect(repoLink).toBeDefined();
    expect(repoLink?.rel).toContain('noopener');
    expect(repoLink?.classList.contains('site-footer__github')).toBe(true);
    expect(repoLink?.querySelector('img')).not.toBeNull();
    expect(links().some((a) => a.getAttribute('href') === '/cli')).toBe(true);
  });

  it('sends Contact to the in-app form, not GitHub issues or a bare mailto', async () => {
    await render();
    expect(links().some((a) => a.getAttribute('href') === '/cli')).toBe(false);

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

  it('prefills the bug report with the current visit id and page', async () => {
    setVisitSessionForTesting(new VisitSession('visit-abc', Date.now(), () => {}));
    window.history.pushState({}, '', '/play/arena-tag');
    await render();

    const bugLink = links().find((a) => a.href.includes('/issues/new'));
    expect(bugLink).toBeDefined();

    const url = new URL(bugLink!.href);
    expect(url.searchParams.get('template')).toBe('bug_report.yml');
    expect(url.searchParams.get('report-id')).toBe('visit-abc');
    expect(url.searchParams.get('where')).toBe('/play/arena-tag');
  });

  it('still offers the bug link when nothing is tracking the visit', async () => {
    await render();

    const bugLink = links().find((a) => a.href.includes('/issues/new'));
    expect(bugLink).toBeDefined();
    expect(new URL(bugLink!.href).searchParams.has('report-id')).toBe(false);
  });
});
