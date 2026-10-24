import { describe, expect, it } from 'vitest';
import { gameVideosUrl, splashYouTubeUrl, withUtm } from './gameVideos.js';

describe('gameVideos', () => {
  it('links a game with a playlist, tagged by placement and slug', () => {
    const url = new URL(gameVideosUrl('trenchline-command', 'player_menu') ?? '');
    expect(url.origin + url.pathname).toBe('https://www.youtube.com/playlist');
    expect(url.searchParams.get('list')).toBe('PLOjEHsPPD9oQ');
    expect(url.searchParams.get('utm_source')).toBe('gamedev.pl');
    expect(url.searchParams.get('utm_medium')).toBe('player_menu');
    expect(url.searchParams.get('utm_campaign')).toBe('trenchline-command');
  });

  it('has nothing for a game without a playlist', () => {
    expect(gameVideosUrl('mexico-86', 'game_page')).toBeNull();
    expect(gameVideosUrl('toString', 'game_page')).toBeNull();
  });

  it('tags the splash links without a campaign', () => {
    expect(splashYouTubeUrl).toBe('https://www.youtube.com/@gamedev_pl?utm_source=gamedev.pl&utm_medium=beta_splash');
    expect(withUtm('https://x.com/plgamedev', 'beta_splash')).toBe(
      'https://x.com/plgamedev?utm_source=gamedev.pl&utm_medium=beta_splash',
    );
  });
});
