/**
 * Composes the archive a creator gets when they choose to work on their game in
 * their own IDE.
 *
 * The product framing matters to what this file does and does not build. This is a
 * **working copy**, not a copy they can take away: gamedev.pl stays the game's home,
 * its system of record, and the only place it publishes from. So the archive carries
 * exactly two things — the creator's own sources, and the scaffold that knows how to
 * fetch the toolchain and deliver back — and deliberately carries neither GameKit nor
 * anything built.
 *
 * Three parts, from three different owners:
 *
 *   - **the scaffold** (`workspaces/<engineRef>.tgz`, packed by the games repo) —
 *     README, `setup.mjs`, `.gitignore`. Games-repo owns it because it is the half
 *     that describes the kit's own commands.
 *   - **the sources** (`games/<slug>/…`, from the immutable version store) — the same
 *     bytes the gate last read, so what the creator opens is what the site last built.
 *   - **`gamedev.lock`** (written here) — which engine this checkout is pinned to and
 *     where to fetch that kit, because only the site knows both.
 *
 * **GameKit is never in the archive.** It is not published to any registry, and the
 * scaffold fetches it at setup time against a short-lived signed URL and gitignores
 * it. That is a licensing boundary (the kit is token-authed, not distributed) and it
 * is also what keeps a checkout from being a self-contained fork: sources without the
 * engine do not run. {@link assertNoEngineContent} enforces it here as well as at pack
 * time, because this is the side that actually hands bytes to a creator.
 */

import { writeTarGz, type TarEntry, type TarInput } from '../platform/tar.js';

/** What the site adds to every workspace so `setup.mjs` knows what to fetch. */
export interface WorkspaceLock {
  slug: string;
  engineRef: string;
  kitUrl: string;
  kitSha256: string;
  issuedAt: string;
}

export interface ComposeWorkspaceInput {
  slug: string;
  lock: WorkspaceLock;
  /** Entries of the games-repo scaffold tarball, already decompressed. */
  scaffold: TarEntry[];
  /** The game's delivered sources, paths relative to the game directory. */
  sources: Array<{ path: string; content: string }>;
}

export class WorkspaceCompositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceCompositionError';
  }
}

/**
 * Paths that would mean the scaffold is shipping the engine or a game.
 *
 * `shared/` is GameKit itself; `games/` is this side's namespace and a scaffold
 * writing into it could shadow the creator's own files. Checked against the archive
 * we are about to emit rather than trusting the packer, because a bad scaffold
 * published once would otherwise be handed to every creator until someone noticed.
 */
/**
 * First path segments the scaffold may never use — the engine, the creator's own
 * namespace, and installed output. Shared with {@link stripCommonRoot}, which must not
 * mistake any of them for a packaging wrapper.
 */
const RESERVED_ROOTS = new Set(['shared', 'node_modules', 'games']);

/**
 * Scaffold members without which the archive is not a working copy.
 *
 * `setup.mjs` is how the kit arrives and the README is how the creator gets back; an
 * archive missing either is sources in a folder. Named here rather than trusted from the
 * packer because this is the side that hands bytes to a creator. Kept to the two that are
 * load-bearing, so adding an optional scaffold file does not need a change on both sides.
 */
const REQUIRED_SCAFFOLD_FILES = ['setup.mjs', 'README.md'];

function assertNoEngineContent(path: string): void {
  const first = path.split('/')[0];
  if (first === 'shared' || first === 'node_modules') {
    throw new WorkspaceCompositionError(
      `workspace scaffold must not carry engine content (${path}) — the kit is fetched at setup, never shipped`,
    );
  }
  if (first === 'games') {
    throw new WorkspaceCompositionError(`workspace scaffold must not write into games/ (${path})`);
  }
}

/**
 * Drop a single wrapping directory if the tarball has one.
 *
 * `npm pack`-style archives wrap everything in one directory and `git archive` adds a
 * `<repo>-<sha>/` prefix, so whether the scaffold arrives wrapped depends on how it was
 * packed — a detail this side should tolerate rather than encode. Only an unambiguous
 * wrapper is stripped: every entry must share it, and there must be more than one path
 * segment to strip from.
 *
 * **A reserved root is never treated as a wrapper.** If the Creator Kit were ever
 * published to the workspace object by mistake, every entry would share the root
 * `shared/` — and stripping it would rewrite `shared/modules/gfx.ts` to
 * `modules/gfx.ts`, walking the engine straight past {@link assertNoEngineContent} and
 * into a creator's archive. Leaving the root on is what lets that check see it. The
 * cost of the guard is refusing to unwrap a scaffold someone deliberately wrapped in a
 * directory called `shared`, which is not a thing anyone should do.
 */
export function stripCommonRoot(entries: TarEntry[]): TarEntry[] {
  if (entries.length === 0) return entries;
  const first = entries[0].path.split('/')[0];
  if (RESERVED_ROOTS.has(first)) return entries;
  const wrapped = entries.every((entry) => {
    const segments = entry.path.split('/');
    return segments.length > 1 && segments[0] === first;
  });
  if (!wrapped) return entries;
  return entries.map((entry) => ({ ...entry, bytes: entry.bytes, path: entry.path.slice(first.length + 1) }));
}

/** Normalizes and refuses anything that would extract outside the archive root. */
function safePath(path: string, what: string): string {
  const normalized = path.replace(/^\.\//, '').trim();
  if (normalized === '' || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new WorkspaceCompositionError(`refusing ${what} path "${path}"`);
  }
  return normalized;
}

/**
 * The ready-to-`git init` archive, as gzipped tar bytes.
 *
 * Deterministic: the same sources, scaffold and lock produce the same bytes, which is
 * what lets the response be compared or cached. `issuedAt` lives in the lock rather
 * than in file mtimes, so the archive changes only when its contents actually do.
 */
export function composeWorkspaceArchive(input: ComposeWorkspaceInput): Buffer {
  const { slug, lock } = input;
  const files: TarInput[] = [];
  const claimed = new Set<string>();

  for (const entry of stripCommonRoot(input.scaffold)) {
    const path = safePath(entry.path, 'scaffold');
    assertNoEngineContent(path);
    if (path === 'gamedev.lock') {
      // The site owns this file; a scaffold shipping its own would be overwritten
      // silently, which is the kind of thing that is only ever noticed in the field.
      throw new WorkspaceCompositionError('workspace scaffold must not ship gamedev.lock — the site writes it');
    }
    // Caught here rather than left to the tar writer: the writer throws a plain Error,
    // which the route does not recognize as a composition failure and would return as a
    // 500 — the wrong answer for a scaffold we published badly.
    if (claimed.has(path)) {
      throw new WorkspaceCompositionError(`workspace scaffold lists ${path} twice`);
    }
    claimed.add(path);
    files.push({ path, content: entry.bytes, executable: path.endsWith('.mjs') || path.endsWith('.sh') });
  }

  // An empty or truncated tar decompresses cleanly and simply yields nothing, so without
  // this the creator gets a 200 and an archive with their sources but no `setup.mjs` and
  // no README — no way to fetch the kit, and no instructions for delivering back. Silent
  // uselessness is worse than a refusal an operator can see.
  const missingScaffold = REQUIRED_SCAFFOLD_FILES.filter((required) => !claimed.has(required));
  if (missingScaffold.length > 0) {
    throw new WorkspaceCompositionError(`workspace scaffold is missing ${missingScaffold.join(', ')}`);
  }

  if (input.sources.length === 0) {
    throw new WorkspaceCompositionError(`${slug} has no delivered sources to check out`);
  }

  for (const source of input.sources) {
    const relative = safePath(source.path, 'source');
    const path = `games/${slug}/${relative}`;
    if (claimed.has(path)) {
      throw new WorkspaceCompositionError(`duplicate path in workspace: ${path}`);
    }
    claimed.add(path);
    files.push({ path, content: source.content });
  }

  files.push({ path: 'gamedev.lock', content: `${JSON.stringify(lock, null, 2)}\n` });

  // Sorted so the archive is a function of its contents and not of the order the
  // store happened to list them in.
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return writeTarGz(files);
}
