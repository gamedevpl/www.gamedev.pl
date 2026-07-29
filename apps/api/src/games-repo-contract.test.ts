import { describe, expect, it } from 'vitest';
import {
  extractGameKitModules,
  extractMaxBundleBytes,
  extractMusicContractSignals,
  GAME_BUDGET_BYTES,
  GAME_KIT_MODULES,
  GAMEKIT_PLATFORM_BYTES,
  MAX_PROJECT_BYTES,
  MUSIC_CONTRACT,
} from './games-repo-contract.js';
import { MAX_PROJECT_BYTES as ASSEMBLE_MAX } from './assemble.js';

describe('games-repo-contract (website half)', () => {
  it('keeps the serve budget at the Check 4 total (games-repo MAX_BUNDLE_BYTES)', () => {
    expect(MAX_PROJECT_BYTES).toBe(429_687);
    expect(GAME_BUDGET_BYTES + GAMEKIT_PLATFORM_BYTES).toBe(MAX_PROJECT_BYTES);
    // assemble.ts must re-export the same number — a second literal would drift.
    expect(ASSEMBLE_MAX).toBe(MAX_PROJECT_BYTES);
  });

  it('keeps the fixtures/games-repo assemble-contract snapshot in lockstep', async () => {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');
    const fixturePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../fixtures/games-repo/shared/assemble-contract.json',
    );
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as {
      maxProjectBytes: number;
      gameKitModules: string[];
      authorBudgetBytes: number;
    };
    expect(fixture.maxProjectBytes).toBe(MAX_PROJECT_BYTES);
    expect(fixture.authorBudgetBytes).toBe(GAME_BUDGET_BYTES);
    expect(fixture.gameKitModules).toEqual([...GAME_KIT_MODULES]);
  });

  it('lists GameKit modules in the post-draw-surface canonical order', () => {
    expect([...GAME_KIT_MODULES]).toEqual([
      'input',
      'collision',
      'world',
      'ai',
      'gameplay',
      'drawing',
      'actors',
      'gfx',
      'gfx3d',
      'effects',
      'audio',
      'party',
      'save',
      'commons',
      'mascot',
      'zone',
    ]);
  });

  it('documents the music field as a string over the tracks catalog key', () => {
    expect(MUSIC_CONTRACT.manifestFieldType).toBe('string');
    expect(MUSIC_CONTRACT.catalogTracksKey).toBe('tracks');
  });
});

describe('games-repo source extractors', () => {
  it('reads GAME_KIT_MODULES from an assemble.ts-shaped source', () => {
    const source = `
      // Canonical order
      export const GAME_KIT_MODULES = [
        'input', 'collision', 'world', 'ai', 'gameplay',
        'drawing', 'actors', 'gfx', 'gfx3d', 'effects', 'audio', 'party', 'save', 'commons', 'mascot', 'zone',
      ] as const;
    `;
    expect(extractGameKitModules(source)).toEqual([...GAME_KIT_MODULES]);
  });

  it('evaluates MAX_BUNDLE_BYTES across named platform allowances', () => {
    // Values mirror games-repo validate.ts, allowance for allowance, so the total
    // is the real MAX_PROJECT_BYTES rather than a made-up sum that happens to land
    // on it. Two of them are `a + b` sums over there — an allowance that was raised
    // keeps the original and the raise side by side instead of collapsing to one
    // opaque number — so the extractor has to evaluate those, not just read literals.
    const source = `
      const GAME_BUDGET_BYTES = 200 * 1024;
      const GAMEKIT_TOUCH_BYTES = 7_501 + 5_560;
      const GAMEKIT_RESTART_BYTES = 2_477;
      const GAMEKIT_MUSIC_BYTES = 7_091 + 650;
      const GAMEKIT_TOUCH_HINT_BYTES = 89;
      const GAMEKIT_PROGRESS_BYTES = 307;
      const GAMEKIT_UNIVERSAL_INPUT_BYTES = 3_191;
      const GAMEKIT_POINTER_POLL_BYTES = 7_083;
      const GAMEKIT_DRAW_SURFACE_BYTES = 9_459;
      const GAMEKIT_POINTER_RELEASE_BYTES = 430;
      const GAMEKIT_HOST_PAUSE_BYTES = 1_473;
      const GAMEKIT_MASCOT_DRAW_BYTES = 679;
      const GAMEKIT_HEADROOM_BYTES = 75_237;
      const GAMEKIT_GFX3D_BYTES = 96_000;
      const GAMEKIT_LOOK_CONTROLS_BYTES = 4_683;
      const GAMEKIT_SPATIAL_AUDIO_BYTES = 2_977;
      const MAX_BUNDLE_BYTES =
        GAME_BUDGET_BYTES +
        GAMEKIT_TOUCH_BYTES +
        GAMEKIT_RESTART_BYTES +
        GAMEKIT_MUSIC_BYTES +
        GAMEKIT_TOUCH_HINT_BYTES +
        GAMEKIT_PROGRESS_BYTES +
        GAMEKIT_UNIVERSAL_INPUT_BYTES +
        GAMEKIT_POINTER_POLL_BYTES +
        GAMEKIT_DRAW_SURFACE_BYTES +
        GAMEKIT_POINTER_RELEASE_BYTES +
        GAMEKIT_HOST_PAUSE_BYTES +
        GAMEKIT_MASCOT_DRAW_BYTES +
        GAMEKIT_HEADROOM_BYTES +
        GAMEKIT_GFX3D_BYTES +
        GAMEKIT_LOOK_CONTROLS_BYTES +
        GAMEKIT_SPATIAL_AUDIO_BYTES;
    `;
    expect(extractMaxBundleBytes(source)).toBe(MAX_PROJECT_BYTES);
  });

  it('evaluates a numeric MAX_BUNDLE_BYTES literal', () => {
    expect(extractMaxBundleBytes('const MAX_BUNDLE_BYTES = 248_372;')).toBe(248372);
  });

  it('detects the music injection contract signals', () => {
    const source = `
      import { readMusicCatalog } from '../audio.ts';
      const catalog = readMusicCatalog();
      const track = catalog.tracks[name];
      out += \`window.__GAME_AUDIO_MUSIC__ = \${JSON.stringify(name)};\`;
      out += \`window.__GAME_MUSIC_TRACKS__ = Object.freeze(\${JSON.stringify({ [name]: track })});\`;
    `;
    expect(extractMusicContractSignals(source)).toEqual({
      injectsMusicName: true,
      readsTracksKey: true,
      readsMusicCatalog: true,
    });
  });

  it('still accepts the older inline music.json catalog read', () => {
    const source = `
      const catalog = JSON.parse(await read('shared/audio/music.json'));
      const track = catalog.tracks[name];
      out += \`window.__GAME_AUDIO_MUSIC__ = \${JSON.stringify(name)};\`;
    `;
    expect(extractMusicContractSignals(source)).toMatchObject({
      injectsMusicName: true,
      readsTracksKey: true,
      readsMusicCatalog: true,
    });
  });

  it('does not treat a bare music.json mention as the historical catalog path', () => {
    const source = `
      // TODO: migrate music.json later
      const track = catalog.tracks[name];
      out += \`window.__GAME_AUDIO_MUSIC__ = \${JSON.stringify(name)};\`;
    `;
    expect(extractMusicContractSignals(source).readsMusicCatalog).toBe(false);
  });
});
