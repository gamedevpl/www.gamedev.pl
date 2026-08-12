import { describe, expect, it } from 'vitest';
import type { KitTree, KitFileStore } from './kit-files.js';
import type { GamesStore, SourceFile } from './games-store.js';
import { KIT_ROOT_DIR } from './kit-registry.js';
import { computeStageAdvisories } from './stage-hints.js';

const KIT_DTS = `
interface GameKitDrawStyle { fill?: string; }
interface GameKitDraw {
  text(value: string, x: number, y: number, opts?: GameKitDrawStyle & { align?: string }): void;
}
interface GameKitGameContext { draw: GameKitDraw; }
declare const GameKit: { defineGame(): unknown };
`;

function kitTree(files: Record<string, string>): KitTree {
  const map = new Map<string, Buffer>();
  for (const [rel, body] of Object.entries(files)) {
    map.set(`${KIT_ROOT_DIR}/${rel}`, Buffer.from(body, 'utf8'));
  }
  return { engineRef: 'engine-1', sha256: 'a'.repeat(64), files: map };
}

function fakeKitFileStore(tree: KitTree | null, error?: Error): KitFileStore {
  return {
    loadRegistry: async () => {
      throw new Error('not used in these tests');
    },
    loadTree: async () => {
      if (error) throw error;
      if (!tree) throw new Error('no tree configured');
      return tree;
    },
    loadCurrentTree: async () => {
      throw new Error('not used in these tests');
    },
  };
}

function fakeGamesStore(staged: Record<string, string>): GamesStore {
  const files: SourceFile[] = Object.entries(staged).map(([path, content]) => ({ path, content }));
  return {
    async getStagedSourceFiles() {
      return files;
    },
    async getStagedSourceFile({ path }: { path: string }) {
      return staged[path] ?? null;
    },
  } as unknown as GamesStore;
}

const BASE_INPUT = {
  slug: 'my-game',
  issueNumber: 1,
  roundGeneration: 1,
  engineRef: 'engine-1',
};

describe('computeStageAdvisories', () => {
  it('no-ops when there is no kit file store', async () => {
    const result = await computeStageAdvisories({
      ...BASE_INPUT,
      kitFileStore: null,
      gamesStore: fakeGamesStore({}),
      path: 'game/runtime.ts',
      content: 'export {};',
    });
    expect(result).toEqual({});
  });

  it('no-ops when the round has no pinned engine ref yet', async () => {
    const result = await computeStageAdvisories({
      ...BASE_INPUT,
      engineRef: undefined,
      kitFileStore: fakeKitFileStore(kitTree({ 'shared/game-kit.d.ts': KIT_DTS })),
      gamesStore: fakeGamesStore({}),
      path: 'game/runtime.ts',
      content: 'export {};',
    });
    expect(result).toEqual({});
  });

  it('no-ops for a path that is neither .ts nor GAME.json', async () => {
    const result = await computeStageAdvisories({
      ...BASE_INPUT,
      kitFileStore: fakeKitFileStore(kitTree({ 'shared/game-kit.d.ts': KIT_DTS })),
      gamesStore: fakeGamesStore({}),
      path: 'SPEC.md',
      content: '# hi',
    });
    expect(result).toEqual({});
  });

  it('no-ops when the kit tree fails to load', async () => {
    const result = await computeStageAdvisories({
      ...BASE_INPUT,
      kitFileStore: fakeKitFileStore(null, new Error('gcs offline')),
      gamesStore: fakeGamesStore({}),
      path: 'game/runtime.ts',
      content: 'export {};',
    });
    expect(result).toEqual({});
  });

  it('flags a typecheck error in a staged .ts file', async () => {
    const result = await computeStageAdvisories({
      ...BASE_INPUT,
      kitFileStore: fakeKitFileStore(kitTree({ 'shared/game-kit.d.ts': KIT_DTS })),
      gamesStore: fakeGamesStore({}),
      path: 'game/render.ts',
      content: `
export function paint(kit: GameKitGameContext) {
  kit.draw.text('hi', 0, 0, { textAlign: 'center' });
}
`,
    });
    expect(result.typecheckHint).toBeDefined();
    expect(result.typecheckHint).toMatch(/textAlign/);
  });

  it('does not flag a well-typed staged .ts file', async () => {
    const result = await computeStageAdvisories({
      ...BASE_INPUT,
      kitFileStore: fakeKitFileStore(kitTree({ 'shared/game-kit.d.ts': KIT_DTS })),
      gamesStore: fakeGamesStore({}),
      path: 'game/render.ts',
      content: `
export function paint(kit: GameKitGameContext) {
  kit.draw.text('hi', 0, 0, { align: 'center' });
}
`,
    });
    expect(result.typecheckHint).toBeUndefined();
  });

  it('merges other staged files into the typecheck so a cross-file error is still caught', async () => {
    const result = await computeStageAdvisories({
      ...BASE_INPUT,
      kitFileStore: fakeKitFileStore(kitTree({ 'shared/game-kit.d.ts': KIT_DTS })),
      gamesStore: fakeGamesStore({
        'game/model.ts': `export type GameState = { score: number };\n`,
      }),
      path: 'game/runtime.ts',
      content: `
import type { GameState } from './model.ts';
export function tick(state: GameState) {
  return state.lives;
}
`,
    });
    expect(result.typecheckHint).toMatch(/has no property/);
    expect(result.typecheckHint).toMatch(/lives/);
  });

  it('flags GAME.json audio.music naming a track outside the shared catalog', async () => {
    const result = await computeStageAdvisories({
      ...BASE_INPUT,
      kitFileStore: fakeKitFileStore(
        kitTree({
          'shared/game-kit.d.ts': KIT_DTS,
          'shared/audio/music.json': JSON.stringify({ tracks: { 'poignant-piano': {} } }),
        }),
      ),
      gamesStore: fakeGamesStore({}),
      path: 'GAME.json',
      content: JSON.stringify({ audio: { music: 'fantasy-adventure', sounds: ['win'] } }),
    });
    expect(result.audioHint).toMatch(/unknown music track "fantasy-adventure"/);
    expect(result.audioHint).toMatch(/poignant-piano/);
  });

  it('does not flag a music track that exists in the shared catalog', async () => {
    const result = await computeStageAdvisories({
      ...BASE_INPUT,
      kitFileStore: fakeKitFileStore(
        kitTree({
          'shared/game-kit.d.ts': KIT_DTS,
          'shared/audio/music.json': JSON.stringify({ tracks: { 'poignant-piano': {} } }),
        }),
      ),
      gamesStore: fakeGamesStore({}),
      path: 'GAME.json',
      content: JSON.stringify({ audio: { music: 'poignant-piano', sounds: ['win'] } }),
    });
    expect(result.audioHint).toBeUndefined();
  });

  it('does not flag a custom track shipped in a staged music.json', async () => {
    const customTrack = {
      bpm: 120,
      steps: 8,
      channels: [{ wave: 'square', pattern: ['C4', null, null, null, null, null, null, null] }],
    };
    const result = await computeStageAdvisories({
      ...BASE_INPUT,
      kitFileStore: fakeKitFileStore(
        kitTree({
          'shared/game-kit.d.ts': KIT_DTS,
          'shared/audio/music.json': JSON.stringify({ tracks: { 'poignant-piano': {} } }),
        }),
      ),
      gamesStore: fakeGamesStore({
        'music.json': JSON.stringify({ version: 1, tracks: { 'raid-theme': customTrack } }),
      }),
      path: 'GAME.json',
      content: JSON.stringify({ audio: { music: 'raid-theme', sounds: ['win'] } }),
    });
    expect(result.audioHint).toBeUndefined();
  });

  it('flags a staged music.json that redefines a shared catalog track id', async () => {
    const customTrack = {
      bpm: 120,
      steps: 8,
      channels: [{ wave: 'square', pattern: ['C4', null, null, null, null, null, null, null] }],
    };
    const result = await computeStageAdvisories({
      ...BASE_INPUT,
      kitFileStore: fakeKitFileStore(
        kitTree({
          'shared/game-kit.d.ts': KIT_DTS,
          'shared/audio/music.json': JSON.stringify({ tracks: { 'poignant-piano': {} } }),
        }),
      ),
      gamesStore: fakeGamesStore({
        'music.json': JSON.stringify({ version: 1, tracks: { 'poignant-piano': customTrack } }),
      }),
      path: 'GAME.json',
      content: JSON.stringify({ audio: { music: 'poignant-piano', sounds: ['win'] } }),
    });
    expect(result.audioHint).toMatch(/redefines shared catalog track/);
  });

  it('no-ops for GAME.json with no audio.music set', async () => {
    const result = await computeStageAdvisories({
      ...BASE_INPUT,
      kitFileStore: fakeKitFileStore(
        kitTree({
          'shared/game-kit.d.ts': KIT_DTS,
          'shared/audio/music.json': JSON.stringify({ tracks: { 'poignant-piano': {} } }),
        }),
      ),
      gamesStore: fakeGamesStore({}),
      path: 'GAME.json',
      content: JSON.stringify({ engine: { modules: ['gfx'] } }),
    });
    expect(result.audioHint).toBeUndefined();
  });
});
