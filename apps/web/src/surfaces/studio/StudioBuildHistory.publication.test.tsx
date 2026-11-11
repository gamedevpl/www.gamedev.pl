// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import i18n from '../../i18n/index.js';
import type { SubmissionStatus } from '../../submissionApi.js';
import { StudioBuildHistory } from './StudioBuildHistory.js';
import { isStudioGameShelfLive } from '../../studioShelf.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

const builds: SubmissionStatus = {
  status: 'in_review',
  slug: 'cozycraft',
  recentBuilds: [
    { version: 'v3', createdAt: '2026-11-10T09:00:00Z', mode: 'publish', verdict: 'green' },
    { version: 'v2', createdAt: '2026-11-09T09:00:00Z', mode: 'publish', verdict: 'green' },
    { version: 'v1', createdAt: '2026-11-08T09:00:00Z', mode: 'publish', verdict: 'red' },
  ],
};

it('does not treat publication history as live after a game is taken offline', () => {
  expect(
    isStudioGameShelfLive({
      token: 'tip',
      title: 'Cozycraft',
      createdAt: '2026-11-10',
      lastKnownStatus: 'building',
      livePublishedAt: '2026-11-09',
      live: false,
    }),
  ).toBe(false);
});

async function render(props: Parameters<typeof StudioBuildHistory>[0], language = 'en') {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage(language);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<StudioBuildHistory {...props} />));
  cleanups.push(() => {
    root.unmount();
    host.remove();
  });
  return host;
}

it('keeps the registered public version separate from a newer passed build being previewed', async () => {
  const host = await render({ status: builds, published: true, publishedVersion: 'v2', playingVersion: 'v3' });
  const card = host.querySelector('.studio-publication-status');
  expect(card?.textContent).toContain('Public version#v2');
  expect(card?.textContent).toContain('This preview is not the public version.');
  expect(card?.querySelector('a')?.getAttribute('href')).toBe('/play/cozycraft');
  const rows = host.querySelectorAll('.studio-build-history-row');
  expect(rows[0]?.querySelector('.studio-build-history-public')).toBeNull();
  expect(rows[0]?.querySelector('.studio-build-history-playing')?.textContent).toContain('Viewing');
  expect(rows[1]?.querySelector('.studio-build-history-public')?.textContent).toBe('Public version');
});

it('shows the public identity even when it is outside the loaded history', async () => {
  const host = await render({ status: builds, published: true, publishedVersion: 'v0', playingVersion: 'v0' });
  expect(host.querySelector('.studio-publication-status')?.textContent).toContain('Public version#v0');
  expect(host.textContent).toContain('Same as the public version.');
  expect(host.querySelectorAll('.studio-build-history-public')).toHaveLength(0);
});

it.each([false, undefined])(
  'does not call a passed publish check public without registry evidence: %s',
  async (published) => {
    const host = await render({ status: builds, published, playingVersion: 'v3' });
    expect(host.querySelectorAll('.studio-build-history-public')).toHaveLength(0);
    expect(host.querySelector('.studio-publication-status a')).toBeNull();
    if (published === false)
      expect(host.querySelector('.studio-publication-status')?.textContent).toContain('Not published');
  },
);

it('does not claim a preview differs when a legacy public version is unknown', async () => {
  const host = await render({ status: builds, published: true, playingVersion: 'v3' });
  expect(host.querySelector('.studio-publication-preview')?.textContent).toContain(
    'Public version could not be compared.',
  );
  expect(host.textContent).not.toContain('This preview is not the public version.');
});

it('shows publication status without build history and translates the public and preview distinction', async () => {
  const host = await render({ status: { status: 'building' }, published: false }, 'pl');
  expect(host.querySelector('.studio-publication-heading')?.textContent).toBe('Nieopublikowana');
  expect(host.querySelector('.studio-publication-status')?.textContent).toContain('Gra nie ma wersji publicznej.');
});
