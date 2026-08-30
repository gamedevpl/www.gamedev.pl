// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LegalPage } from './LegalPage.js';
import { legalDocument, type LegalDocument } from './legal/index.js';
import i18n from './i18n/index.js';

vi.mock('./legal/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./legal/index.js')>()),
  legalDocument: vi.fn(),
}));

const mockedLegalDocument = vi.mocked(legalDocument);

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

const PRIVACY_EN: LegalDocument = {
  id: 'privacy',
  title: 'Privacy Policy',
  effectiveDate: '2026-01-01',
  intro: 'intro',
  sections: [],
};

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  mockedLegalDocument.mockReset();
});

afterEach(() => {
  container.remove();
});

/**
 * legalDocument() loads only the reader's language on demand (see legal/index.ts) —
 * this covers the loading-then-resolved render, and that a language switch requests
 * the newly active language rather than reusing whatever loaded first.
 */
describe('LegalPage', () => {
  it('shows a loading state, then the resolved document', async () => {
    await i18n.changeLanguage('en');
    let resolve!: (doc: LegalDocument) => void;
    mockedLegalDocument.mockReturnValue(new Promise((r) => (resolve = r)));
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(LegalPage, { doc: 'privacy', onBack: () => {} }));
      await flushEffects();
    });
    expect(container.querySelector('.content-loading')).not.toBeNull();
    expect(mockedLegalDocument).toHaveBeenCalledWith('privacy', 'en');

    await act(async () => {
      resolve(PRIVACY_EN);
      await flushEffects();
    });
    expect(container.querySelector('.content-loading')).toBeNull();
    expect(container.querySelector('.legal-title')?.textContent).toBe('Privacy Policy');

    await act(async () => {
      root.unmount();
    });
  });

  it('requests the newly active language on a switch', async () => {
    await i18n.changeLanguage('en');
    mockedLegalDocument.mockResolvedValue(PRIVACY_EN);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(LegalPage, { doc: 'privacy', onBack: () => {} }));
      await flushEffects();
    });
    expect(mockedLegalDocument).toHaveBeenLastCalledWith('privacy', 'en');

    await act(async () => {
      await i18n.changeLanguage('pl');
      await flushEffects();
    });
    expect(mockedLegalDocument).toHaveBeenLastCalledWith('privacy', 'pl');

    await act(async () => {
      root.unmount();
    });
  });

  it('offers a reload prompt instead of loading forever when the import rejects', async () => {
    // Regression: a stale tab across a deploy requesting a hashed chunk the new
    // build no longer serves used to leave the page stuck on "Loading…" forever.
    await i18n.changeLanguage('en');
    mockedLegalDocument.mockRejectedValue(new Error('Failed to fetch dynamically imported module'));
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(LegalPage, { doc: 'privacy', onBack: () => {} }));
      await flushEffects();
    });
    expect(container.querySelector('.content-loading')).toBeNull();
    expect(container.querySelector('.content-load-error')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
