import { describe, expect, it } from 'vitest';
import { gameSocialLinks, splashYouTubeUrl, withUtm } from './gameVideos.js';

describe('gameVideos', () => {
  it('tags a game playlist and falls back to the brand X account', () => {
    const social = gameSocialLinks(
      'trenchline-command',
      { youtube: 'https://www.youtube.com/playlist?list=PLOjEHsPPD9oQ' },
      'player_menu',
    );
    const youtube = new URL(social?.youtube ?? '');
    expect(youtube.searchParams.get('list')).toBe('PLOjEHsPPD9oQ');
    expect(youtube.searchParams.get('utm_source')).toBe('gamedev.pl');
    expect(youtube.searchParams.get('utm_medium')).toBe('player_menu');
    expect(youtube.searchParams.get('utm_campaign')).toBe('trenchline-command');
    expect(social?.x).toBe(
      'https://x.com/plgamedev?utm_source=gamedev.pl&utm_medium=player_menu&utm_campaign=trenchline-command',
    );
  });

  it("uses the game's own X link when the SPEC names one", () => {
    const social = gameSocialLinks('neon', { x: 'https://x.com/gtanczyk/status/1' }, 'game_page');
    expect(social?.youtube).toBeNull();
    expect(social?.x.startsWith('https://x.com/gtanczyk/status/1?')).toBe(true);
  });

  it('has nothing for a game without links', () => {
    expect(gameSocialLinks('mexico-86', null, 'game_page')).toBeNull();
    expect(gameSocialLinks('mexico-86', undefined, 'game_page')).toBeNull();
    expect(gameSocialLinks('mexico-86', {}, 'game_page')).toBeNull();
  });

  it('tags the splash links without a campaign', () => {
    expect(splashYouTubeUrl).toBe('https://www.youtube.com/@gamedev_pl?utm_source=gamedev.pl&utm_medium=beta_splash');
    expect(withUtm('https://x.com/plgamedev', 'beta_splash')).toBe(
      'https://x.com/plgamedev?utm_source=gamedev.pl&utm_medium=beta_splash',
    );
  });
});
