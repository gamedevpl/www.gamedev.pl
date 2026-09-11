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
    expect(catalog.find((entry) => entry.slug === 'pixel-dodge')?.submittedBy).toBe('gamedev-platform');
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

  // Generated markup: see docs/how-to-play-plan.md
  describe('index.html generated from GAME.json howToPlay', () => {
    const manifestWithHowToPlay = JSON.stringify({
      engine: { modules: [] },
      audio: { sounds: [] },
      description: { en: 'Dodge the pixels', pl: 'Unikaj pikseli' },
      howToPlay: {
        controls: [{ keys: 'WASD', action: { en: 'Move', pl: 'Ruch' } }],
        goal: { en: 'Survive', pl: 'Przetrwaj' },
        hint: { en: 'Keep moving', pl: 'Nie zatrzymuj się' },
      },
    });

    it('generates the body when the game ships no index.html', async () => {
      const sources = await client.getGameSources('main', 'pixel-dodge', {
        'index.html': '',
        'GAME.json': manifestWithHowToPlay,
      });

      expect(sources).not.toBeNull();
      // The DOM contract the hand-authored files established, reproduced from schema.
      expect(sources?.indexHtml).toContain('id="game"');
      expect(sources?.indexHtml).toContain('id="game-status"');
      expect(sources?.indexHtml).toContain('<dt>WASD</dt>');
      expect(sources?.indexHtml).toContain('data-i18n-pl="Przetrwaj"');
      // Engine half untouched by the markup change
      expect(sources?.gameJs).toContain('requestAnimationFrame');
    });

    it('prefers a shipped index.html over the schema', async () => {
      const sources = await client.getGameSources('main', 'pixel-dodge', {
        'index.html': '<div id="authored"></div>',
        'GAME.json': manifestWithHowToPlay,
      });

      expect(sources?.indexHtml).toBe('<div id="authored"></div>');
    });

    it('returns null when there is neither markup nor a howToPlay to derive it from', async () => {
      // Unreadable, not empty — no caller serves a blank document
      const sources = await client.getGameSources('main', 'pixel-dodge', {
        'index.html': '',
        'GAME.json': JSON.stringify({ engine: { modules: [] }, audio: { sounds: [] } }),
      });

      expect(sources).toBeNull();
    });

    it('returns null when howToPlay is missing the hint the generator needs', async () => {
      const sources = await client.getGameSources('main', 'pixel-dodge', {
        'index.html': '',
        'GAME.json': JSON.stringify({
          engine: { modules: [] },
          audio: { sounds: [] },
          howToPlay: { goal: { en: 'Survive', pl: 'Przetrwaj' } },
        }),
      });

      expect(sources).toBeNull();
    });

    it('returns null rather than throwing when goal/hint are truthy but not {en, pl} strings', async () => {
      // `goal: true` used to crash inside generateIndexHtml instead of returning null
      const sources = await client.getGameSources('main', 'pixel-dodge', {
        'index.html': '',
        'GAME.json': JSON.stringify({
          engine: { modules: [] },
          audio: { sounds: [] },
          howToPlay: { goal: true, hint: { en: 'Keep moving', pl: 'Nie zatrzymuj się' } },
        }),
      });

      expect(sources).toBeNull();
    });
  });

  it('refuses to read outside the games directory', async () => {
    // The slug guard rejects traversal before it reaches the filesystem, and the reader
    // resolves paths inside the root as a second line of defence.
    expect(await client.getGameSources('main', '../../../etc')).toBeNull();
    expect(await client.getProgressNotes('main', '../../package.json')).toBeNull();
  });

  it('invents issue state in memory', async () => {
    const issueNumber = 1234;
    expect(await client.getIssueState(issueNumber)).toEqual({ state: 'open' });

    await client.closeIssue(issueNumber);
    expect(await client.getIssueState(issueNumber)).toEqual({ state: 'closed' });

    // No agent runs locally, so there is never a linked pull request.
    expect(await client.findLinkedPR(issueNumber)).toBeNull();
  });

  it('falls back to the bundled fixtures when the configured directory is empty', async () => {
    const resolved = await resolveLocalGamesDir({ GAMES_LOCAL_DIR: '/tmp/definitely-not-a-games-checkout' });
    expect(resolved.source).toBe('env');

    const withoutEnv = await resolveLocalGamesDir({});
    expect(['checkout', 'fixtures']).toContain(withoutEnv.source);
  });
});
