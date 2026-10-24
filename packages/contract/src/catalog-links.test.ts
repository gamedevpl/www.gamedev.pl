import { describe, expect, it } from 'vitest';
import { parseCatalogLinks } from './catalog-links.js';

describe('parseCatalogLinks', () => {
  it('keeps https links on the expected hosts', () => {
    expect(
      parseCatalogLinks({
        youtube: ' https://www.youtube.com/playlist?list=PLOjEHsPPD9oQ ',
        x: 'https://x.com/plgamedev/status/1',
      }),
    ).toEqual({
      youtube: 'https://www.youtube.com/playlist?list=PLOjEHsPPD9oQ',
      x: 'https://x.com/plgamedev/status/1',
    });
  });

  it('drops links to other hosts, other schemes and junk', () => {
    expect(parseCatalogLinks({ youtube: 'https://evil.example/playlist', x: 'javascript:alert(1)' })).toBeNull();
    expect(parseCatalogLinks({ youtube: 'http://www.youtube.com/@gamedev_pl' })).toBeNull();
    expect(parseCatalogLinks({ x: 'https://youtube.com/@gamedev_pl' })).toBeNull();
    expect(parseCatalogLinks({ youtube: 'not a url' })).toBeNull();
    expect(parseCatalogLinks('https://www.youtube.com/')).toBeNull();
    expect(parseCatalogLinks(null)).toBeNull();
  });

  it('keeps a source repo on a known forge only', () => {
    expect(parseCatalogLinks({ source: 'https://github.com/gtanczyk/airtime' })).toEqual({
      source: 'https://github.com/gtanczyk/airtime',
    });
    expect(parseCatalogLinks({ source: 'https://github.io.evil.example/airtime' })).toBeNull();
  });

  it('keeps one link when only one is valid', () => {
    expect(parseCatalogLinks({ youtube: 'https://youtu.be/abc', x: 'https://x.co/evil' })).toEqual({
      youtube: 'https://youtu.be/abc',
    });
  });
});
