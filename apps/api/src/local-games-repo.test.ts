import { describe, expect, it } from 'vitest';
import { createLocalGamesClient, FIXTURE_GAMES_DIR, resolveLocalGamesDir } from './local-games-repo.js';

const client = createLocalGamesClient({ rootDir: FIXTURE_GAMES_DIR });

describe('local games repo', () => {
  it('builds a catalog from the bundled fixtures', async () => {
    const catalog = await client.getCatalog('main');
    const slugs = catalog.map((entry) => entry.slug).sort();

    expect(slugs).toEqual(['odd-one-out', 'pixel-dodge', 'range-squad']);
    expect(catalog.every((entry) => entry.status === 'published')).toBe(true);
    expect(catalog.find((entry) => entry.slug === 'pixel-dodge')?.title).toBe('Pixel Dodge');
  });

  it('assembles playable sources through the real bundler', async () => {
    const sources = await client.getGameSources('main', 'pixel-dodge');

    expect(sources).not.toBeNull();
    expect(sources?.title).toBe('Pixel Dodge');
    // TypeScript went through esbuild, so the type annotations are gone but the logic is present.
    expect(sources?.gameJs).toContain('requestAnimationFrame');
    expect(sources?.gameJs).not.toContain(': HTMLCanvasElement');
    // The shared shell is prepended to the game's own stylesheet.
    expect(sources?.styleCss).toContain('.wrap');
    expect(sources?.indexHtml).toContain('id="game"');
  });

  it('assembles a GameKit-shaped fixture with gfx/actors/audio.music (contract regression)', async () => {
    // range-squad mirrors the post-draw-surface production shape that 502'd when
    // GAME_KIT_MODULES / music drifted (issue #247). Going through the real local
    // bundler means a stale allow-list or music contract fails `npm test` offline.
    const sources = await client.getGameSources('main', 'range-squad');

    expect(sources).not.toBeNull();
    expect(sources?.title).toBe('Range Squad');
    expect(sources?.gameJs).toContain('GameKit.gfx = true');
    expect(sources?.gameJs).toContain('GameKit.actors = true');
    expect(sources?.gameJs).toContain('window.__GAME_AUDIO_MUSIC__ = "march";');
    expect(sources?.gameJs).toContain('window.__GAME_MUSIC_TRACKS__');
    expect(sources?.gameJs).toContain('"march"');
    expect(sources?.gameJs).not.toContain('import ');
    expect(() => new Function(sources?.gameJs ?? '')).not.toThrow();
  });

  it('returns null for a game that does not exist', async () => {
    expect(await client.getGameSources('main', 'no-such-game')).toBeNull();
  });

  it('refuses to read outside the games directory', async () => {
    // The slug guard rejects traversal before it reaches the filesystem, and the reader
    // resolves paths inside the root as a second line of defence.
    expect(await client.getGameSources('main', '../../../etc')).toBeNull();
    expect(await client.getProgressNotes('main', '../../package.json')).toBeNull();
  });

  it('invents issue state in memory so the creation flow can complete', async () => {
    const issue = await client.createIssue({
      title: 'A local game idea',
      body: 'concept',
      labels: [],
    });
    expect(issue.number).toBeGreaterThan(0);

    expect(await client.getIssueState(issue.number)).toEqual({ state: 'open' });

    await client.closeIssue(issue.number);
    expect(await client.getIssueState(issue.number)).toEqual({ state: 'closed' });

    // No agent runs locally, so there is never a linked pull request.
    expect(await client.findLinkedPR(issue.number)).toBeNull();
  });

  it('falls back to the bundled fixtures when the configured directory is empty', async () => {
    const resolved = await resolveLocalGamesDir({ GAMES_LOCAL_DIR: '/tmp/definitely-not-a-games-checkout' });
    expect(resolved.source).toBe('env');

    const withoutEnv = await resolveLocalGamesDir({});
    expect(['checkout', 'fixtures']).toContain(withoutEnv.source);
  });
});
