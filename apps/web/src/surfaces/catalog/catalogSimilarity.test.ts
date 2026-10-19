import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '../../catalog.js';
import { similarCatalogEntries } from './catalogSimilarity.js';

function entry(slug: string, genre: string): CatalogEntry {
  return {
    slug,
    title: slug,
    genre,
    controls: 'Arrow keys',
    status: 'published',
    media: null,
    multiplayer: null,
    saves: null,
    world: null,
    sensing: null,
    editor: null,
    orientation: 'any',
    touch: null,
    submittedBy: null,
  };
}

const apex = entry('apex-sprint', 'rally time trial (3d)');

describe('similarCatalogEntries', () => {
  it('matches rally to racing without filling slots from unrelated games', () => {
    const kart = entry('party-karts', 'racing');
    const candidates = [
      entry('miniature-warfare', 'real-time tactics'),
      entry('neon-strike-cell', 'tactical action'),
      entry('unicorn-snap', 'photography (3d)'),
      entry('shooter', 'arcade shooter'),
      entry('generic', 'arcade'),
      kart,
      apex,
    ];
    expect(similarCatalogEntries(apex, candidates)).toEqual([kart]);
  });

  it('prioritizes exact genres, ignoring capitalization, punctuation and dimension', () => {
    const kart = entry('kart', 'arcade racing (3d)');
    const rally = entry('rally', ' RALLY  TIME-TRIAL (2D) ');
    expect(similarCatalogEntries(apex, [kart, rally])).toEqual([rally, kart]);
  });

  it('returns at most three matches, preserving catalog order among ties', () => {
    const racers = ['a', 'b', 'c', 'd'].map((slug) => entry(slug, 'racing'));
    expect(similarCatalogEntries(apex, racers)).toEqual(racers.slice(0, 3));
    expect(racers).toHaveLength(4);
  });

  it.each(['', 'arcade', 'action', 'arcade action', 'simulation', 'party', 'sports'])(
    'does not infer similarity from the generic genre %j',
    (genre) => {
      expect(similarCatalogEntries(entry('featured', genre), [entry('other', genre)])).toEqual([]);
    },
  );

  it('does not treat unknown genres as one family', () => {
    const photo = entry('photo', 'photography (3d)');
    expect(similarCatalogEntries(apex, [photo])).toEqual([]);
    expect(similarCatalogEntries(entry('a', 'signal navigation'), [entry('b', 'paperwork')])).toEqual([]);
  });

  it('can match a specific unrecognized genre exactly without guessing a family', () => {
    const other = entry('other', 'signal navigation');
    expect(similarCatalogEntries(entry('featured', 'signal navigation'), [other])).toEqual([other]);
  });

  it.each([
    ['first-person shooter', 'vertical shmup'],
    ['beat-em-up', 'fighting'],
    ['turn-based strategy', 'real-time tactics'],
    ['roguelike', 'roguelite deckbuilder'],
    ['match-3 puzzle', 'packing puzzle'],
  ])('matches related genres %j and %j', (genre, relatedGenre) => {
    const related = entry('related', relatedGenre);
    expect(similarCatalogEntries(entry('featured', genre), [related])).toEqual([related]);
  });

  it('does not use multiplayer support as evidence of similarity', () => {
    const multiplayer = { mode: 'controllers' as const, minPlayers: 2, maxPlayers: 4 };
    expect(similarCatalogEntries({ ...apex, multiplayer }, [{ ...entry('brawl', 'fighting'), multiplayer }])).toEqual(
      [],
    );
  });
});
