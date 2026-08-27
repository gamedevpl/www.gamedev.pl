import { describe, expect, it } from 'vitest';
import {
  DELIVERY_CONTRACT_VERSION,
  DELIVERY_EXTRA_MODULE_PATTERN,
  DELIVERY_FIXED_FILES,
  DELIVERY_MAX_FILES,
  DELIVERY_MAX_UPLOAD_BYTES,
  DELIVERY_RESERVED_SEGMENTS,
  extractDeliveryContract,
  extractGameKitModules,
  extractGameKitVerticals,
  extractMaxBundleBytes,
  extractMusicContractSignals,
  GAME_BUDGET_BYTES,
  GAME_KIT_MODULES,
  GAME_KIT_VERTICAL_ENTRIES,
  GAMEKIT_PLATFORM_BYTES,
  MAX_PROJECT_BYTES,
  MAX_SOURCE_GRAPH_MODULES,
  MUSIC_CONTRACT,
  SOURCE_GRAPH_BUDGET_BYTES,
  stripLeadingDocComment,
} from './games-repo-contract.js';
import { MAX_PROJECT_BYTES as ASSEMBLE_MAX } from './assemble.js';
import { ALLOWED_SOURCE_FILES, MAX_UPLOAD_BYTES, MAX_UPLOAD_FILES } from '../delivery/games-store.js';

/** The real games-repo file, snapshotted under fixtures/ (see local-games-repo.ts). */
async function readDeliveryContractFixture(): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  return readFile(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures/games-repo/shared/delivery-contract.json'),
    'utf8',
  );
}

/** A well-formed contract to mutate one field of, so each rejection test names one cause. */
function validContract(): Record<string, unknown> {
  return {
    version: DELIVERY_CONTRACT_VERSION,
    fixedFiles: [...DELIVERY_FIXED_FILES],
    extraModulePattern: DELIVERY_EXTRA_MODULE_PATTERN.source,
    reservedSegments: [...DELIVERY_RESERVED_SEGMENTS],
    maxFiles: DELIVERY_MAX_FILES,
    maxUploadBytes: DELIVERY_MAX_UPLOAD_BYTES,
  };
}

describe('games-repo-contract (website half)', () => {
  it('keeps the serve budget at the Check 4 total (games-repo MAX_BUNDLE_BYTES)', () => {
    expect(MAX_PROJECT_BYTES).toBe(1_368_464);
    expect(GAME_BUDGET_BYTES + GAMEKIT_PLATFORM_BYTES).toBe(MAX_PROJECT_BYTES);
    // assemble.ts must re-export the same number — a second literal would drift.
    expect(ASSEMBLE_MAX).toBe(MAX_PROJECT_BYTES);
  });

  it('keeps the bake/play source-graph ceiling above the assembled author budget', () => {
    // Raw `.ts` can exceed assembled author bytes (comments/types). Carjack-city
    // at ~334 KiB source is why this is 336 KiB rather than matching GAME_BUDGET_BYTES.
    expect(SOURCE_GRAPH_BUDGET_BYTES).toBe(1062 * 1024);
    expect(SOURCE_GRAPH_BUDGET_BYTES).toBeGreaterThan(GAME_BUDGET_BYTES);
    expect(MAX_SOURCE_GRAPH_MODULES).toBeGreaterThanOrEqual(128);
  });

  it('keeps the fixtures/games-repo assemble-contract snapshot in lockstep', async () => {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');
    const fixturePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../fixtures/games-repo/shared/assemble-contract.json',
    );
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as {
      version: number;
      maxProjectBytes: number;
      gameKitModules: string[];
      authorBudgetBytes: number;
      platformCeilingBytes: number;
      audio: { musicField: string; musicTracksField: string };
    };
    expect(fixture.version).toBe(2);
    // The audio injection shape is half of what this fixture exists to pin: `music` is the
    // autoplay track and `musicTracks` the extras a game switches to. Serve-time assembly
    // must embed both, or a published game's mid-round score change silently no-ops.
    expect(fixture.audio.musicField).toBe(MUSIC_CONTRACT.manifestFieldType);
    expect(fixture.audio.musicTracksField).toBe(MUSIC_CONTRACT.manifestTracksFieldType);
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
      'grid',
      'path',
      'ai',
      'gameplay',
      'rng',
      'cards',
      'vehicles',
      'urban',
      'drawing',
      'actors',
      'gfx',
      'ui',
      'gfx3d',
      'racing',
      'football',
      'platformer',
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
      'inspect',
    ]);
  });

  it('documents the optional per-game music.json path', () => {
    expect(MUSIC_CONTRACT.gameMusicPath).toBe('music.json');
    expect(MUSIC_CONTRACT.catalogPath).toBe('shared/audio/music.json');
  });

  it('documents the music field as a string over the tracks catalog key', () => {
    expect(MUSIC_CONTRACT.manifestFieldType).toBe('string');
    expect(MUSIC_CONTRACT.catalogTracksKey).toBe('tracks');
  });
});

describe('delivery contract (website half)', () => {
  it('is the single source games-store enforces, not a second literal', () => {
    expect(ALLOWED_SOURCE_FILES).toBe(DELIVERY_FIXED_FILES);
    expect(MAX_UPLOAD_FILES).toBe(DELIVERY_MAX_FILES);
    expect(MAX_UPLOAD_BYTES).toBe(DELIVERY_MAX_UPLOAD_BYTES);
  });

  it('keeps the fixed deliverables in the contract order', () => {
    expect([...DELIVERY_FIXED_FILES]).toEqual([
      'SPEC.md',
      'GAME.json',
      'music.json',
      'CAPTURE.json',
      'ACCEPTANCE.json',
      'TRACE.json',
      'PLAYTEST.json',
      'AGENT.json',
      'EDITOR.json',
      'EDITOR.ts',
      'EDITOR.content.json',
      'index.html',
      'game.ts',
      'style.css',
      'sim.ts',
    ]);
  });

  it('keeps the extra-module pattern comparable to the games-repo JSON byte-for-byte', () => {
    // A regex *literal* would render `/` as `\/` in `.source` and read as permanent drift.
    expect(DELIVERY_EXTRA_MODULE_PATTERN.source).toBe('^[a-z0-9][a-z0-9/-]{0,60}\\.ts$');
    expect(DELIVERY_EXTRA_MODULE_PATTERN.test('game/editor-content.ts')).toBe(true);
    expect(DELIVERY_EXTRA_MODULE_PATTERN.test('Game.ts')).toBe(false);
  });
});

describe('extractDeliveryContract', () => {
  it('accepts the real games-repo contract file and agrees with the local constants', async () => {
    const contract = extractDeliveryContract(await readDeliveryContractFixture());
    expect(contract.version).toBe(DELIVERY_CONTRACT_VERSION);
    expect(contract.fixedFiles).toEqual([...DELIVERY_FIXED_FILES]);
    expect(contract.extraModulePattern).toBe(DELIVERY_EXTRA_MODULE_PATTERN.source);
    expect([...contract.reservedSegments].sort()).toEqual([...DELIVERY_RESERVED_SEGMENTS].sort());
    expect(contract.maxFiles).toBe(DELIVERY_MAX_FILES);
    expect(contract.maxUploadBytes).toBe(DELIVERY_MAX_UPLOAD_BYTES);
  });

  it('ignores the underscore-prefixed prose the contract carries for humans', () => {
    const withProse = JSON.stringify({ ...validContract(), _comment: 'why', _notDelivered: 'media/' });
    expect(extractDeliveryContract(withProse).fixedFiles).toEqual([...DELIVERY_FIXED_FILES]);
  });

  it('rejects input that is not JSON', () => {
    expect(() => extractDeliveryContract('{ nope')).toThrow(/not valid JSON/);
  });

  it('rejects a JSON array or scalar where an object belongs', () => {
    expect(() => extractDeliveryContract('[]')).toThrow(/must be a JSON object/);
    expect(() => extractDeliveryContract('7')).toThrow(/must be a JSON object/);
  });

  it('rejects a missing or empty fixedFiles list', () => {
    const { fixedFiles: _omitted, ...withoutFixedFiles } = validContract();
    expect(() => extractDeliveryContract(JSON.stringify(withoutFixedFiles))).toThrow(/`fixedFiles` must be an array/);
    expect(() => extractDeliveryContract(JSON.stringify({ ...validContract(), fixedFiles: [] }))).toThrow(
      /`fixedFiles` is empty/,
    );
  });

  it('names the offending index when a fixed file is not a string', () => {
    const broken = { ...validContract(), fixedFiles: ['SPEC.md', 42] };
    expect(() => extractDeliveryContract(JSON.stringify(broken))).toThrow(/`fixedFiles\[1\]`/);
  });

  it('rejects an extraModulePattern that is not a compilable regular expression', () => {
    expect(() => extractDeliveryContract(JSON.stringify({ ...validContract(), extraModulePattern: '[' }))).toThrow(
      /not a valid regular expression/,
    );
    expect(() => extractDeliveryContract(JSON.stringify({ ...validContract(), extraModulePattern: '' }))).toThrow(
      /must be a non-empty string/,
    );
  });

  it('rejects caps that are not positive integers', () => {
    for (const bad of [0, -1, 1.5, '200', null]) {
      expect(() => extractDeliveryContract(JSON.stringify({ ...validContract(), maxFiles: bad }))).toThrow(
        /`maxFiles` must be a positive integer/,
      );
      expect(() => extractDeliveryContract(JSON.stringify({ ...validContract(), maxUploadBytes: bad }))).toThrow(
        /`maxUploadBytes` must be a positive integer/,
      );
    }
  });
});

describe('games-repo source extractors', () => {
  it('reads GAME_KIT_MODULES from an assemble.ts-shaped source', () => {
    const source = `
      // Canonical order
      export const GAME_KIT_MODULES = [
        'input', 'collision', 'world', 'grid', 'path', 'ai', 'gameplay', 'rng', 'cards', 'vehicles', 'urban',
        'drawing', 'actors', 'gfx', 'ui', 'gfx3d', 'racing', 'football', 'platformer', 'effects', 'audio', 'party', 'save', 'commons', 'presence', 'mascot', 'zone',
        'sensing', 'voice', 'editor', 'inspect',
      ] as const;
    `;
    expect(extractGameKitModules(source)).toEqual([...GAME_KIT_MODULES]);
  });

  it('reads GAME_KIT_VERTICALS from an assemble.ts-shaped source', () => {
    const source = `const GAME_KIT_VERTICALS = Object.freeze({
      gfx3d: 'shared/modules/gfx3d/index.ts',
      vehicles: 'shared/verticals/vehicles/index.ts',
      urban: 'shared/verticals/urban/index.ts',
      racing: 'shared/verticals/racing/index.ts',
      football: 'shared/verticals/football/index.ts',
      platformer: 'shared/verticals/platformer/index.ts',
    });`;
    expect(extractGameKitVerticals(source)).toEqual(GAME_KIT_VERTICAL_ENTRIES);
  });

  it('rejects an assemble source with no verticals to compare', () => {
    expect(() => extractGameKitVerticals('const GAME_KIT_MODULES = [];')).toThrow(/no GAME_KIT_VERTICALS object/);
    expect(() => extractGameKitVerticals('const GAME_KIT_VERTICALS = Object.freeze({});')).toThrow(
      /GAME_KIT_VERTICALS object is empty/,
    );
  });

  it('resolves every vertical to a games-repo path, never to shared/modules root', () => {
    // The regression behind the failed nightly bake: `vehicles` was a name both sides
    // knew, but only the games repo knew it had moved out of shared/modules.
    for (const [name, entry] of Object.entries(GAME_KIT_VERTICAL_ENTRIES)) {
      expect(GAME_KIT_MODULES).toContain(name);
      expect(entry).toMatch(/^shared\/(verticals|modules)\/[a-z0-9-]+\/index\.ts$/);
    }
  });

  it('evaluates MAX_BUNDLE_BYTES from the single platform ceiling', () => {
    // Games-repo #281 collapsed the per-feature ledger into one GAMEKIT_PLATFORM_BYTES.
    // The extractor still has to resolve `BUDGET + PLATFORM` (and `a + b` / `a * b`
    // forms inside those consts), not only bare literals.
    const source = `
      const GAME_BUDGET_BYTES = 936 * 1024;
      const GAMEKIT_PLATFORM_BYTES = 410_000;
      const MAX_BUNDLE_BYTES = GAME_BUDGET_BYTES + GAMEKIT_PLATFORM_BYTES;
    `;
    expect(extractMaxBundleBytes(source)).toBe(MAX_PROJECT_BYTES);
  });

  it('still evaluates a + b allowance expressions when a tip uses them', () => {
    const source = `
      const GAME_BUDGET_BYTES = 936 * 1024;
      const GAMEKIT_TOUCH_BYTES = 7_501 + 5_560;
      const GAMEKIT_PLATFORM_BYTES = GAMEKIT_TOUCH_BYTES + 396_939;
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

  /**
   * Per-game `music.json` moved catalog resolution behind `resolveMusicTracksForGame`,
   * which merges the shared catalog with an optional per-game one. The contract still
   * only accepted `readMusicCatalog`, so every PR went red on a games-repo change — the
   * failure this case exists to prevent recurring.
   */
  it('accepts resolveMusicTracksForGame, the reader per-game music.json introduced', () => {
    const source = `
      import { readAudioCatalog, resolveMusicTracksForGame } from '../audio.ts';
      const musicTracksMap = resolveMusicTracksForGame(slug);
      const tracks = { [musicName]: musicTracksMap[musicName] };
      out += \`window.__GAME_AUDIO_MUSIC__ = \${JSON.stringify(musicName)};\`;
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

describe('stripLeadingDocComment', () => {
  it('removes the leading /** */ block and trims the surrounding blank lines', () => {
    const source = '/**\n * Some header prose.\n * Second line.\n */\n\nexport const x = 1;\n';
    expect(stripLeadingDocComment(source)).toBe('export const x = 1;');
  });

  it('lets each side keep different header prose without affecting the result', () => {
    const code = 'export const x = 1;\nexport function y() {}\n';
    const withHeaderA = `/**\n * Header A explains itself one way.\n */\n\n${code}`;
    const withHeaderB = `/**\n * Header B — same code, different words, different length.\n */\n\n${code}`;
    expect(stripLeadingDocComment(withHeaderA)).toBe(stripLeadingDocComment(withHeaderB));
  });

  it('returns the source unchanged when there is no leading doc comment', () => {
    const source = 'export const x = 1;\n';
    expect(stripLeadingDocComment(source)).toBe('export const x = 1;');
  });

  it('does not consume a doc comment that is not at the very top of the file', () => {
    // Only the file's own opening /** */ is exempt — not a comment before it.
    const source = '// eslint-disable-next-line\n/**\n * Not actually the header.\n */\nexport const x = 1;\n';
    expect(stripLeadingDocComment(source)).toBe(source.trim());
  });
});
