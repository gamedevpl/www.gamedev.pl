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
    expect(MAX_PROJECT_BYTES).toBe(517_800);
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
      version: number;
      maxProjectBytes: number;
      gameKitModules: string[];
      authorBudgetBytes: number;
      platformCeilingBytes: number;
    };
    expect(fixture.version).toBe(2);
    expect(fixture.maxProjectBytes).toBe(MAX_PROJECT_BYTES);
    expect(fixture.authorBudgetBytes).toBe(GAME_BUDGET_BYTES);
    expect(fixture.platformCeilingBytes).toBe(GAMEKIT_PLATFORM_BYTES);
    expect(fixture.gameKitModules).toEqual([...GAME_KIT_MODULES]);
  });

  it('lists GameKit modules in the post-draw-surface canonical order', () => {
    expect([...GAME_KIT_MODULES]).toEqual([
      'input',
      'collision',
      'world',
      'ai',
      'gameplay',
      'urban',
      'drawing',
      'actors',
      'gfx',
      'gfx3d',
      'racing',
      'football',
      'effects',
      'audio',
      'party',
      'save',
      'commons',
      'presence',
      'mascot',
      'zone',
      'sensing',
      'voice',
      'editor',
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
        'input', 'collision', 'world', 'ai', 'gameplay', 'urban',
        'drawing', 'actors', 'gfx', 'gfx3d', 'racing', 'football', 'effects', 'audio', 'party', 'save', 'commons', 'presence', 'mascot', 'zone',
        'sensing', 'voice', 'editor',
      ] as const;
    `;
    expect(extractGameKitModules(source)).toEqual([...GAME_KIT_MODULES]);
  });

  it('evaluates MAX_BUNDLE_BYTES from the single platform ceiling', () => {
    // Games-repo #281 collapsed the per-feature ledger into one GAMEKIT_PLATFORM_BYTES.
    // The extractor still has to resolve `BUDGET + PLATFORM` (and `a + b` / `a * b`
    // forms inside those consts), not only bare literals.
    const source = `
      const GAME_BUDGET_BYTES = 200 * 1024;
      const GAMEKIT_PLATFORM_BYTES = 313_000;
      const MAX_BUNDLE_BYTES = GAME_BUDGET_BYTES + GAMEKIT_PLATFORM_BYTES;
    `;
    expect(extractMaxBundleBytes(source)).toBe(MAX_PROJECT_BYTES);
  });

  it('still evaluates a + b allowance expressions when a tip uses them', () => {
    const source = `
      const GAME_BUDGET_BYTES = 200 * 1024;
      const GAMEKIT_TOUCH_BYTES = 7_501 + 5_560;
      const GAMEKIT_PLATFORM_BYTES = GAMEKIT_TOUCH_BYTES + 299_939;
      const MAX_BUNDLE_BYTES = GAME_BUDGET_BYTES + GAMEKIT_PLATFORM_BYTES;
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
