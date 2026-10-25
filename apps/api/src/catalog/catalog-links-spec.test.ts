import { describe, expect, it } from 'vitest';
import { catalogEntryFromSpec } from './github-client.js';

const spec = (extra: string) => `---\ntitle: Airtime\ngenre: arcade\ncontrols: keys\n${extra}---\n\nA game.\n`;

describe('catalogEntryFromSpec links', () => {
  it('carries youtube, x and source lines from the frontmatter', () => {
    const entry = catalogEntryFromSpec(
      'airtime',
      spec(
        'youtube: https://www.youtube.com/playlist?list=PLabc\nx: https://x.com/plgamedev\nsource: https://github.com/gamedevpl/airtime\n',
      ),
      () => null,
    );
    expect(entry?.links).toEqual({
      youtube: 'https://www.youtube.com/playlist?list=PLabc',
      x: 'https://x.com/plgamedev',
      source: 'https://github.com/gamedevpl/airtime',
    });
  });

  it('leaves links off when the spec names none or only bad ones', () => {
    expect(catalogEntryFromSpec('airtime', spec(''), () => null)).not.toHaveProperty('links');
    expect(catalogEntryFromSpec('airtime', spec('source: https://evil.example/x\n'), () => null)).not.toHaveProperty(
      'links',
    );
  });
});
