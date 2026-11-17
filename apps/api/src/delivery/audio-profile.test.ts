import { describe, expect, it } from 'vitest';
import { KIT_ROOT_DIR } from '../platform/kit-registry.js';
import { audioProfile, audioStarterCopyHint } from './audio-profile.js';

const STARTER = { sounds: ['ui-toggle', 'heavy-arcade-impact', 'arcade-whoosh'], music: 'carnival-spin' };

function tree(extra: Record<string, string> = {}) {
  const files: Record<string, string> = {
    'shared/audio/music.json': JSON.stringify({ tracks: { 'carnival-spin': {}, 'chip-battle': {} } }),
    'shared/audio/sounds.json': JSON.stringify({ sounds: { 'ui-toggle': {}, boom: {} } }),
    'shared/audio/sourced.json': JSON.stringify({
      sounds: { 'heavy-arcade-impact': {}, 'arcade-whoosh': {}, 'artillery-cannon-thud': {} },
    }),
    'starters/arena-tag/GAME.json': JSON.stringify({ audio: STARTER }),
    'starters/rook-rush/GAME.json': JSON.stringify({ audio: { sounds: ['ui-toggle', 'boom'], music: 'chip-battle' } }),
    ...extra,
  };
  return {
    files: new Map(Object.entries(files).map(([path, body]) => [`${KIT_ROOT_DIR}/${path}`, Buffer.from(body, 'utf8')])),
  };
}

const game = (audio: Record<string, unknown>) => JSON.stringify({ audio });

describe('audioProfile', () => {
  it('names the starter whose sounds and music a game ships unchanged', () => {
    // The observed case: ui-toggle dropped, everything else copied.
    const sounds = STARTER.sounds.filter((id) => id !== 'ui-toggle');
    const profile = audioProfile({ tree: tree(), gameJson: game({ sounds, music: 'carnival-spin' }) });
    expect(profile).toMatchObject({ starterCopy: 'arena-tag', starterMusic: true, sounds: 2, sourcedSounds: 2 });
  });

  it('still flags copied sounds under a different track', () => {
    const profile = audioProfile({ tree: tree(), gameJson: game({ ...STARTER, music: 'chip-battle' }) });
    expect(profile).toMatchObject({ starterCopy: 'arena-tag', starterMusic: false, customMusic: false });
  });

  it('does not flag a chosen set, and reports custom music and wanted sounds', () => {
    const profile = audioProfile({
      tree: tree(),
      gameJson: game({
        sounds: ['ui-toggle', 'artillery-cannon-thud', 'boom'],
        music: 'robot-siege',
        wanted: [' robot servo whirr ', 7, 'x'.repeat(200)],
      }),
    });
    expect(profile).toMatchObject({ starterCopy: null, customMusic: true, music: 'robot-siege', sourcedSounds: 1 });
    expect(profile?.wanted).toEqual(['robot servo whirr', 'x'.repeat(80)]);
  });

  it('returns null without an audio block or valid JSON', () => {
    expect(audioProfile({ tree: tree(), gameJson: '{}' })).toBeNull();
    expect(audioProfile({ tree: tree(), gameJson: '{' })).toBeNull();
  });
});

describe('audioStarterCopyHint', () => {
  const copied = (kit: ReturnType<typeof tree>) => audioProfile({ tree: kit, gameJson: game(STARTER) });

  it('names the starter and the kit search when the kit ships it', () => {
    const kit = tree({ 'tools/audio-find.ts': '' });
    const hint = audioStarterCopyHint(kit, copied(kit));
    expect(hint).toContain('"arena-tag" starter');
    expect(hint).toContain('music included');
    expect(hint).toContain('npm run audio:find');
  });

  it('falls back to a catalog search on a kit without the script', () => {
    const kit = tree();
    const hint = audioStarterCopyHint(kit, copied(kit));
    expect(hint).toContain('shared/audio/sourced.json');
    expect(hint).not.toContain('audio:find');
  });

  it('stays silent for a chosen set', () => {
    const kit = tree();
    expect(
      audioStarterCopyHint(
        kit,
        audioProfile({ tree: kit, gameJson: game({ sounds: ['boom', 'artillery-cannon-thud'], music: 'x' }) }),
      ),
    ).toBeNull();
  });
});
