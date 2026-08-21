import { describe, expect, it } from 'vitest';
import {
  SEED_SCAFFOLD_SLUG,
  buildSeedContext,
  createArchiveSeedContextSource,
  type SeedFileIndex,
} from './seed-context.js';

function indexOf(files: Record<string, string>): SeedFileIndex {
  return { paths: Object.keys(files), read: (path) => files[path] ?? null };
}

const CATALOG = JSON.stringify([
  { slug: 'apex-sprint', title: 'Apex Sprint', genre: 'arcade racing', status: 'published' },
  { slug: 'word-forge', title: 'Word Forge', genre: 'word puzzle', status: 'published' },
  { slug: 'retired-game', title: 'Retired', genre: 'arcade', status: 'archived' },
]);

const FILES: Record<string, string> = {
  'catalog.json': CATALOG,
  'shared/game-kit.d.ts': 'interface GameKitDraw { circle(x: number, y: number, r: number): void; }\n',
  'shared/modules/core.ts': 'export const core = true;\n',
  [`games/${SEED_SCAFFOLD_SLUG}/SPEC.md`]: '---\ntitle: Block Cascade\n---\n',
  [`games/${SEED_SCAFFOLD_SLUG}/game.ts`]: "import { startGame } from './game/runtime.ts';\n",
  [`games/${SEED_SCAFFOLD_SLUG}/game/runtime.ts`]: 'export function startGame() {}\n',
  'games/apex-sprint/SPEC.md': '---\ntitle: Apex Sprint\n---\n',
  'games/apex-sprint/game.ts': 'export {};\n',
  'games/apex-sprint/game/model.ts': 'export const SPEED = 1;\n',
  'games/apex-sprint/game/render.ts': 'export function paint() {}\n',
  'games/word-forge/SPEC.md': '---\ntitle: Word Forge\n---\n',
  'games/word-forge/game.ts': 'export {};\n',
  'games/word-forge/game/model.ts': 'export const LETTERS = 7;\n',
  'games/retired-game/game.ts': 'export {};\n',
};

describe('buildSeedContext', () => {
  it('indexes published games as slug — title — genre', () => {
    const context = buildSeedContext(indexOf(FILES))!;

    expect(context.catalogIndex).toBe(
      'apex-sprint — Apex Sprint — arcade racing\nword-forge — Word Forge — word puzzle',
    );
    expect(context.kitDeclaration).toContain('interface GameKitDraw');
  });

  it('excludes games that are not published', () => {
    // A withdrawn or broken game is not a model to copy from, and offering it to the
    // picker would put it in front of the model as though it were exemplary.
    const context = buildSeedContext(indexOf(FILES))!;

    expect(context.catalogIndex).not.toContain('retired-game');
    expect(context.hasGame('retired-game')).toBe(false);
    expect(context.renderReferences(['retired-game'], 100_000)).toBe('');
  });

  it('renders a reference game as fences, modules included and sorted', () => {
    const rendered = buildSeedContext(indexOf(FILES))!.renderReferences(['apex-sprint'], 100_000);

    expect(rendered).toContain('--- games/apex-sprint/SPEC.md ---');
    expect(rendered).toContain('--- games/apex-sprint/game.ts ---');
    // Sorted so the same picks always produce the same prompt; a prompt that varies run
    // to run makes any comparison between runs meaningless.
    expect(rendered.indexOf('game/model.ts')).toBeLessThan(rendered.indexOf('game/render.ts'));
    expect(rendered).toContain('export const SPEED = 1;');
    expect(rendered).not.toContain('game-kit.d.ts');
  });

  it('spends the byte budget across games in pick order', () => {
    const context = buildSeedContext(indexOf(FILES))!;
    const full = context.renderReferences(['apex-sprint', 'word-forge'], 100_000);
    const squeezed = context.renderReferences(['apex-sprint', 'word-forge'], 60);

    expect(full).toContain('word-forge');
    // The budget is shared, so the closest match keeps its place and the tail is dropped
    // rather than every game being truncated into uselessness.
    expect(squeezed.length).toBeLessThan(full.length);
  });

  it('returns null without a catalog, so seeding is skipped rather than guessed', () => {
    expect(buildSeedContext(indexOf({ 'games/x/game.ts': 'export {};' }))).toBeNull();
    expect(buildSeedContext(indexOf({ 'catalog.json': 'not json' }))).toBeNull();
    expect(buildSeedContext(indexOf({ 'catalog.json': '[]' }))).toBeNull();
  });

  it('uses catalogEntries over the archive when given, for a repo with no catalog.json', () => {
    const { 'catalog.json': _drop, ...withoutCatalog } = FILES;
    const entries = [{ slug: 'apex-sprint', title: 'Apex Sprint', genre: 'arcade racing', status: 'published' }];

    const context = buildSeedContext(indexOf(withoutCatalog), entries)!;

    expect(context.catalogIndex).toBe('apex-sprint — Apex Sprint — arcade racing');
    expect(context.hasGame('apex-sprint')).toBe(true);
  });

  it('treats a null override as no catalog, not a fall-through to the archive file', () => {
    expect(buildSeedContext(indexOf(FILES), null)).toBeNull();
  });
});

/** A tarball of `files`, so the archive path can be exercised without GitHub. */
async function tarballResponse(files: Record<string, string> = FILES): Promise<Response> {
  const { createGzip } = await import('node:zlib');
  const chunks: Buffer[] = [];

  function header(name: string, size: number): Buffer {
    const block = Buffer.alloc(512);
    block.write(`repo-root/${name}`, 0, 100, 'utf8');
    block.write('0000644\0', 100, 8, 'utf8');
    block.write('0000000\0', 108, 8, 'utf8');
    block.write('0000000\0', 116, 8, 'utf8');
    block.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'utf8');
    block.write(
      `${Math.floor(Date.now() / 1000)
        .toString(8)
        .padStart(11, '0')}\0`,
      136,
      12,
      'utf8',
    );
    block.write('        ', 148, 8, 'utf8');
    block.write('0', 156, 1, 'utf8');
    block.write('ustar\0', 257, 6, 'utf8');
    block.write('00', 263, 2, 'utf8');
    // Checksum over the header with the checksum field blank-filled, per the format.
    let sum = 0;
    for (const byte of block) sum += byte;
    block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'utf8');
    return block;
  }

  for (const [name, content] of Object.entries(files)) {
    const body = Buffer.from(content, 'utf8');
    chunks.push(header(name, body.byteLength), body);
    const padding = (512 - (body.byteLength % 512)) % 512;
    if (padding > 0) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));

  const gzip = createGzip();
  const output: Buffer[] = [];
  gzip.on('data', (chunk: Buffer) => output.push(chunk));
  const done = new Promise<void>((resolve) => gzip.on('end', () => resolve()));
  gzip.end(Buffer.concat(chunks));
  gzip.resume();
  await done;

  return new Response(Buffer.concat(output), { status: 200 });
}

const { 'catalog.json': _catalogFile, ...FILES_WITHOUT_CATALOG } = FILES;

describe('createArchiveSeedContextSource', () => {
  it('downloads once and serves later loads from cache', async () => {
    let downloads = 0;
    const source = createArchiveSeedContextSource({
      repo: 'gamedevpl/www.gamedev.pl-games',
      ref: 'main',
      token: 'token',
      fetchImpl: async () => {
        downloads++;
        return tarballResponse();
      },
    });

    const first = await source.load();
    const second = await source.load();

    expect(first?.hasGame('apex-sprint')).toBe(true);
    expect(first?.kitDeclaration).toContain('interface GameKitDraw');
    expect(second).toBe(first);
    expect(downloads).toBe(1);
  });

  it('shares one download between concurrent dispatches', async () => {
    let downloads = 0;
    const source = createArchiveSeedContextSource({
      repo: 'gamedevpl/www.gamedev.pl-games',
      ref: 'main',
      token: 'token',
      fetchImpl: async () => {
        downloads++;
        return tarballResponse();
      },
    });

    // Two creators submitting at once must not each pull the repository down the one
    // credential that also serves the catalog.
    const [a, b] = await Promise.all([source.load(), source.load()]);

    expect(a).toBe(b);
    expect(downloads).toBe(1);
  });

  it('returns null on a failed fetch and retries on the next load', async () => {
    let attempts = 0;
    const source = createArchiveSeedContextSource({
      repo: 'gamedevpl/www.gamedev.pl-games',
      ref: 'main',
      token: 'token',
      fetchImpl: async () => {
        attempts++;
        // A failure is deliberately not cached: one bad minute must not turn into ten
        // minutes of unseeded builds.
        if (attempts === 1) return new Response('nope', { status: 500 });
        return tarballResponse();
      },
    });

    expect(await source.load()).toBeNull();
    expect(await source.load()).not.toBeNull();
    expect(attempts).toBe(2);
  });

  it('re-downloads once the cache has expired', async () => {
    let downloads = 0;
    const source = createArchiveSeedContextSource({
      repo: 'gamedevpl/www.gamedev.pl-games',
      ref: 'main',
      token: 'token',
      ttlMs: 0,
      fetchImpl: async () => {
        downloads++;
        return tarballResponse();
      },
    });

    await source.load();
    await source.load();

    expect(downloads).toBe(2);
  });

  it('reproduces the games-repo#422 incident: getCatalog rescues an archive with no catalog.json', async () => {
    let downloads = 0;
    const source = createArchiveSeedContextSource({
      repo: 'gamedevpl/www.gamedev.pl-games',
      ref: 'main',
      token: 'token',
      fetchImpl: async () => {
        downloads++;
        return tarballResponse(FILES_WITHOUT_CATALOG);
      },
      getCatalog: async () => [
        { slug: 'apex-sprint', title: 'Apex Sprint', genre: 'arcade racing', status: 'published' },
      ],
    });

    const context = await source.load();

    expect(downloads).toBe(1);
    expect(context).not.toBeNull();
    expect(context?.hasGame('apex-sprint')).toBe(true);
  });

  it('without getCatalog, an archive missing catalog.json still fails open to null', async () => {
    const source = createArchiveSeedContextSource({
      repo: 'gamedevpl/www.gamedev.pl-games',
      ref: 'main',
      token: 'token',
      fetchImpl: async () => tarballResponse(FILES_WITHOUT_CATALOG),
    });

    expect(await source.load()).toBeNull();
  });
});
