import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readTarEntries, type TarEntry } from '../platform/tar.js';
import { composeWorkspaceArchive, stripCommonRoot, WorkspaceCompositionError } from './workspace-archive.js';

function entry(path: string, body = ''): TarEntry {
  return { path, bytes: Buffer.from(body, 'utf8') };
}

const LOCK = {
  slug: 'comet-courier',
  engineRef: 'a1b2c3d4e5f6',
  kitUrl: 'https://signed.example/kits/a1b2c3d4e5f6.tgz?sig=1',
  kitSha256: 'f'.repeat(64),
  issuedAt: '2026-08-04T10:00:00.000Z',
};

const SCAFFOLD = [
  entry('README.md', '# your working copy\n'),
  entry('setup.mjs', 'fetch kit\n'),
  entry('.gitignore', 'node_modules\n'),
];

const SOURCES = [
  { path: 'SPEC.md', content: '---\nslug: comet-courier\n---\n' },
  { path: 'game.ts', content: "import './game/model.js';\n" },
  { path: 'game/model.ts', content: 'export const speed = 3;\n' },
];

async function extract(archive: Buffer): Promise<TarEntry[]> {
  const entries: TarEntry[] = [];
  const buffer = gunzipSync(archive);
  async function* once(): AsyncGenerator<Uint8Array> {
    yield buffer;
  }
  for await (const item of readTarEntries(once())) {
    entries.push(item);
  }
  return entries;
}

function textOf(entries: TarEntry[], path: string): string {
  const found = entries.find((item) => item.path === path);
  if (!found) throw new Error(`no ${path} in archive: ${entries.map((item) => item.path).join(', ')}`);
  return Buffer.from(found.bytes).toString('utf8');
}

describe('composeWorkspaceArchive', () => {
  it('lays the scaffold at the root and the sources under games/<slug>/', async () => {
    const entries = await extract(
      composeWorkspaceArchive({ slug: 'comet-courier', lock: LOCK, scaffold: SCAFFOLD, sources: SOURCES }),
    );

    expect(entries.map((item) => item.path).sort()).toEqual([
      '.gitignore',
      'README.md',
      'gamedev.lock',
      'games/comet-courier/SPEC.md',
      'games/comet-courier/game.ts',
      'games/comet-courier/game/model.ts',
      'setup.mjs',
    ]);
    expect(textOf(entries, 'games/comet-courier/game/model.ts')).toBe('export const speed = 3;\n');
  });

  it('writes the lock the setup script reads', async () => {
    const entries = await extract(
      composeWorkspaceArchive({ slug: 'comet-courier', lock: LOCK, scaffold: SCAFFOLD, sources: SOURCES }),
    );
    expect(JSON.parse(textOf(entries, 'gamedev.lock'))).toEqual(LOCK);
  });

  it('is deterministic, so the same checkout is the same bytes', () => {
    const input = { slug: 'comet-courier', lock: LOCK, scaffold: SCAFFOLD, sources: SOURCES };
    expect(composeWorkspaceArchive(input).equals(composeWorkspaceArchive(input))).toBe(true);
  });

  it('does not depend on the order the store listed sources in', () => {
    const forward = composeWorkspaceArchive({
      slug: 'comet-courier',
      lock: LOCK,
      scaffold: SCAFFOLD,
      sources: SOURCES,
    });
    const reversed = composeWorkspaceArchive({
      slug: 'comet-courier',
      lock: LOCK,
      scaffold: SCAFFOLD,
      sources: [...SOURCES].reverse(),
    });
    expect(forward.equals(reversed)).toBe(true);
  });

  it('refuses a scaffold carrying GameKit, because the kit is fetched and never shipped', () => {
    expect(() =>
      composeWorkspaceArchive({
        slug: 'comet-courier',
        lock: LOCK,
        scaffold: [...SCAFFOLD, entry('shared/modules/gfx.ts', 'export {}')],
        sources: SOURCES,
      }),
    ).toThrow(WorkspaceCompositionError);
  });

  it('refuses a scaffold that writes into games/ or ships its own lock', () => {
    for (const bad of ['games/other/game.ts', 'gamedev.lock']) {
      expect(() =>
        composeWorkspaceArchive({
          slug: 'comet-courier',
          lock: LOCK,
          scaffold: [...SCAFFOLD, entry(bad, 'x')],
          sources: SOURCES,
        }),
      ).toThrow(WorkspaceCompositionError);
    }
  });

  it('refuses a source path that would escape the game directory', () => {
    expect(() =>
      composeWorkspaceArchive({
        slug: 'comet-courier',
        lock: LOCK,
        scaffold: SCAFFOLD,
        sources: [{ path: '../../etc/passwd', content: 'x' }],
      }),
    ).toThrow(/refusing source path/);
  });

  it('refuses a scaffold that lists the same path twice', () => {
    // Must be a composition error, not the tar writer's plain Error: the route only maps
    // the former to a controlled 502, so the latter would surface as a 500.
    expect(() =>
      composeWorkspaceArchive({
        slug: 'comet-courier',
        lock: LOCK,
        scaffold: [...SCAFFOLD, entry('README.md', 'second copy\n')],
        sources: SOURCES,
      }),
    ).toThrow(WorkspaceCompositionError);
  });

  it('refuses a scaffold missing the files that make it a working copy', () => {
    // An empty or truncated tar decompresses fine and yields nothing, which would
    // otherwise be a 200 carrying sources with no way to fetch the kit or deliver back.
    for (const scaffold of [[], SCAFFOLD.filter((item) => item.path !== 'setup.mjs')]) {
      expect(() => composeWorkspaceArchive({ slug: 'comet-courier', lock: LOCK, scaffold, sources: SOURCES })).toThrow(
        /missing/,
      );
    }
  });

  it('refuses a game with nothing delivered rather than handing back an empty repo', () => {
    expect(() =>
      composeWorkspaceArchive({ slug: 'comet-courier', lock: LOCK, scaffold: SCAFFOLD, sources: [] }),
    ).toThrow(/no delivered sources/);
  });
});

describe('stripCommonRoot', () => {
  it('drops a single wrapping directory', () => {
    expect(stripCommonRoot([entry('wrap/README.md'), entry('wrap/setup.mjs')]).map((item) => item.path)).toEqual([
      'README.md',
      'setup.mjs',
    ]);
  });

  it('leaves entries alone when they do not all share one root', () => {
    const entries = [entry('README.md'), entry('docs/guide.md')];
    expect(stripCommonRoot(entries).map((item) => item.path)).toEqual(['README.md', 'docs/guide.md']);
  });

  it('never mistakes a reserved root for a wrapper', () => {
    // Publishing the kit to the workspace object by mistake makes every entry share
    // `shared/`. Stripping it would rewrite shared/modules/gfx.ts to modules/gfx.ts and
    // walk the engine past the no-engine check into a creator's archive.
    const entries = [entry('shared/modules/gfx.ts'), entry('shared/game-kit.d.ts')];
    expect(stripCommonRoot(entries).map((item) => item.path)).toEqual([
      'shared/modules/gfx.ts',
      'shared/game-kit.d.ts',
    ]);
  });

  it('refuses a kit mispublished as the scaffold, wrapper or not', () => {
    const kitish = [entry('shared/modules/gfx.ts', 'export {}'), entry('shared/game-kit.d.ts', 'declare const x: 1;')];
    expect(() =>
      composeWorkspaceArchive({ slug: 'comet-courier', lock: LOCK, scaffold: kitish, sources: SOURCES }),
    ).toThrow(WorkspaceCompositionError);
  });
});
