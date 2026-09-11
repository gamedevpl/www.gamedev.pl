// Shipped from apps/web/public, served at the site root.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const robots = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'robots.txt'),
  'utf8',
);

function rules(): { disallow: string[]; allow: string[] } {
  const disallow: string[] = [];
  const allow: string[] = [];
  for (const raw of robots.split('\n')) {
    const line = raw.split('#')[0]!.trim();
    const [field, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (!value) continue;
    if (field?.toLowerCase() === 'disallow') disallow.push(value);
    if (field?.toLowerCase() === 'allow') allow.push(value);
  }
  return { disallow, allow };
}

// Longest match wins; Allow beats Disallow at equal length.
function crawlable(pathname: string): boolean {
  const { disallow, allow } = rules();
  const longest = (list: string[]) =>
    list.filter((p) => pathname.startsWith(p)).reduce((best, p) => (p.length > best ? p.length : best), -1);
  const blocked = longest(disallow);
  const permitted = longest(allow);
  return blocked < 0 || permitted >= blocked;
}

describe('robots.txt', () => {
  it('applies to every crawler', () => {
    expect(robots).toMatch(/^User-agent:\s*\*$/m);
  });

  it.each([
    '/status/MTAwMDE2NS45MDhiNzQxMmZl',
    '/draft/some-game',
    '/invite/0123456789abcdef0123456789abcdef',
    '/join/AB12CD',
    '/studio',
    '/studio/some-token/code',
    '/admin',
    '/admin/queue',
  ])('keeps crawlers off %s', (pathname) => {
    expect(crawlable(pathname)).toBe(false);
  });

  it.each(['/', '/privacy', '/terms', '/contact', '/ada/sky-dodge', '/play/sky-dodge', '/creators/ada'])(
    'leaves %s crawlable',
    (pathname) => {
      expect(crawlable(pathname)).toBe(true);
    },
  );

  it('does not blanket-block the API the renderer needs', () => {
    // Googlebot renders the SPA; blocking /api/ would blind it.
    expect(crawlable('/api/catalog')).toBe(true);
    expect(crawlable('/api/games/sky-dodge')).toBe(true);
  });
});
