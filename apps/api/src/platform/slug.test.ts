import { describe, expect, it, vi } from 'vitest';
import { mintGameSlug, slugifyTitle } from './slug.js';

describe('slugifyTitle', () => {
  it('produces a readable address from an ordinary title', () => {
    expect(slugifyTitle('TV Tycoon')).toBe('tv-tycoon');
    expect(slugifyTitle('  Dodge   the Falling Rocks!  ')).toBe('dodge-the-falling-rocks');
  });

  it('keeps Polish titles recognisable as their creator wrote them', () => {
    // "ł" is one indivisible codepoint, so decomposition alone drops it: "Łódź" would
    // slug to "d". Polish is the site's second language, so this is not an edge case.
    expect(slugifyTitle('Łódź Nocą')).toBe('lodz-noca');
    expect(slugifyTitle('Zażółć gęślą jaźń')).toBe('zazolc-gesla-jazn');
  });

  it('always emits something valid, whatever it is handed', () => {
    const shapes = ['🎮🎮🎮', '???', '---', '', '   '];
    for (const title of shapes) {
      const slug = slugifyTitle(title);
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it('cuts a long title at a word boundary and never trails a dash', () => {
    const slug = slugifyTitle('A game tycoon simulator where I run a television business with presenters and ratings');
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    // Whole words only: the point of the whole change is that names stop being cut
    // mid-word, and a slug is the most visible place that would show.
    expect('a-game-tycoon-simulator-where-i-run-a-television-business'.startsWith(slug)).toBe(true);
  });

  it('steps around path segments the app uses', () => {
    // Suffixed rather than replaced: the creator called it "Play", and "play-2" still
    // reads as theirs where a generic fallback would not.
    expect(slugifyTitle('Play')).toBe('play-2');
    expect(slugifyTitle('admin')).toBe('admin-2');
    // Only the exact word is reserved — a game genuinely called this is unaffected.
    expect(slugifyTitle('Play Together')).toBe('play-together');
  });
});

describe('mintGameSlug', () => {
  it('takes the plain name when nothing holds it', async () => {
    expect(await mintGameSlug('TV Tycoon', async () => false)).toBe('tv-tycoon');
  });

  it('numbers collisions so the second one is still recognisable', async () => {
    const taken = new Set(['space-miner', 'space-miner-2']);
    expect(await mintGameSlug('Space Miner', async (slug) => taken.has(slug))).toBe('space-miner-3');
  });

  it('never refuses a build over its address, however hostile the probe', async () => {
    // A probe that answers "taken" to everything is either a very popular title or a
    // broken lookup. Neither is a reason to fail a submission the creator has paid a
    // quota slot for, so the loop has a floor it can always land on.
    const isTaken = vi.fn(async () => true);
    const slug = await mintGameSlug('Space Miner', isTaken, { maxAttempts: 3 });

    expect(isTaken).toHaveBeenCalledTimes(3);
    expect(slug).toMatch(/^space-miner-[a-z0-9]+$/);
    expect(slug).not.toBe('space-miner-2');
  });
});
