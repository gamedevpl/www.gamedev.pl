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
  it('keeps the serve budget at the Check 4 total (242 KiB)', () => {
    expect(MAX_PROJECT_BYTES).toBe(242 * 1024);
    expect(GAME_BUDGET_BYTES + GAMEKIT_PLATFORM_BYTES).toBe(MAX_PROJECT_BYTES);
    // assemble.ts must re-export the same number — a second literal would drift.
    expect(ASSEMBLE_MAX).toBe(MAX_PROJECT_BYTES);
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
      'effects',
      'audio',
      'party',
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
        'drawing', 'actors', 'gfx', 'effects', 'audio', 'party',
      ] as const;
    `;
    expect(extractGameKitModules(source)).toEqual([...GAME_KIT_MODULES]);
  });

  it('evaluates MAX_BUNDLE_BYTES across named platform allowances', () => {
    const source = `
      const GAME_BUDGET_BYTES = 200 * 1024;
      const GAMEKIT_TOUCH_BYTES = 7_501;
      const GAMEKIT_RESTART_BYTES = 1_024;
      const GAMEKIT_MUSIC_BYTES = 4_096;
      const GAMEKIT_TOUCH_HINT_BYTES = 512;
      const GAMEKIT_PROGRESS_BYTES = 2_048;
      const GAMEKIT_UNIVERSAL_INPUT_BYTES = 3_072;
      const GAMEKIT_POINTER_POLL_BYTES = 1_536;
      const GAMEKIT_DRAW_SURFACE_BYTES =
        42 * 1024 -
        GAMEKIT_TOUCH_BYTES -
        GAMEKIT_RESTART_BYTES -
        GAMEKIT_MUSIC_BYTES -
        GAMEKIT_TOUCH_HINT_BYTES -
        GAMEKIT_PROGRESS_BYTES -
        GAMEKIT_UNIVERSAL_INPUT_BYTES -
        GAMEKIT_POINTER_POLL_BYTES;
      const MAX_BUNDLE_BYTES =
        GAME_BUDGET_BYTES +
        GAMEKIT_TOUCH_BYTES +
        GAMEKIT_RESTART_BYTES +
        GAMEKIT_MUSIC_BYTES +
        GAMEKIT_TOUCH_HINT_BYTES +
        GAMEKIT_PROGRESS_BYTES +
        GAMEKIT_UNIVERSAL_INPUT_BYTES +
        GAMEKIT_POINTER_POLL_BYTES +
        GAMEKIT_DRAW_SURFACE_BYTES;
    `;
    expect(extractMaxBundleBytes(source)).toBe(242 * 1024);
  });

  it('evaluates a numeric MAX_BUNDLE_BYTES literal', () => {
    expect(extractMaxBundleBytes('const MAX_BUNDLE_BYTES = 247_808;')).toBe(247808);
  });

  it('detects the music injection contract signals', () => {
    const source = `
      const catalog = JSON.parse(await read('shared/audio/music.json'));
      const track = catalog.tracks[name];
      out += \`window.__GAME_AUDIO_MUSIC__ = \${JSON.stringify(name)};\`;
      out += \`window.__GAME_MUSIC_TRACKS__ = Object.freeze(\${JSON.stringify({ [name]: track })});\`;
    `;
    expect(extractMusicContractSignals(source)).toEqual({
      injectsMusicName: true,
      readsTracksKey: true,
      readsMusicJson: true,
    });
  });
});
