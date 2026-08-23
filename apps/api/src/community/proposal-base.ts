// Where a proposal's starting point comes from.
//
// A proposal is a change to a published game, so it needs that game's current sources to
// build on. The catalog has two lanes and they keep those sources in different places:
//
//   store lane — the published version's `source/` objects in GCS. Already a complete file
//                set, already the thing the gate builds.
//   repo lane  — `games/<slug>/` in the games repo, at the commit the live snapshot was
//                baked from. There is no store version at all.
//
// This module is the single place that difference is resolved, so everything downstream —
// the remix on-ramp, an agent's proposal round, the diff — asks one question and gets a
// file set plus a base to pin the proposal to.
//
// **Scope is structural here, not advisory.** The repo-lane read filters the archive to
// exactly one game directory before anything is retained, so there is no path by which a
// proposal round can see `shared/`, `tools/`, or another game — the same property the
// delivery allowlist gives the write side. A proposer reads one game and writes one game.

import { fetchGamesRepoArchive } from '../games-repo-archive.js';
import type { GamesStore, SourceFile } from '../games-store.js';
import type { GameSnapshotStore } from '../game-snapshot.js';
import type { ProposalBase, Store } from '../store.js';

/** A game's current sources, plus what to pin a proposal built from them to. */
export interface ProposalBaseSources {
  base: ProposalBase;
  files: SourceFile[];
}

export interface ProposalBaseOptions {
  store: Store;
  gamesStore?: GamesStore | null;
  snapshotStore?: GameSnapshotStore | null;
  /** Games repo to read a repo-lane game out of. */
  gamesRepo?: string;
  /** contents:read token for that repo. Absent means repo-lane proposals are unavailable. */
  gamesRepoToken?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Cap on what one game directory may weigh.
 *
 * Generous next to a real game's sources and far below anything that would make a
 * repo-lane proposal interesting as a memory attack. Deliberately smaller than the bake's
 * budget: the bake retains the whole catalog, this retains one game.
 */
const MAX_GAME_ARCHIVE_BYTES = 8 * 1024 * 1024;

/**
 * Files a proposal may carry out of a repo game.
 *
 * Media is excluded because our gate produces it — a proposal that shipped its own
 * screenshots would be claiming a capture it never ran. Everything else under the game's
 * directory is source the delivery contract already knows how to validate on the way back.
 */
function isProposableRepoPath(relative: string): boolean {
  if (relative.startsWith('media/')) return false;
  // `.` segments and absolute paths cannot appear in a tar entry we accepted, but the
  // check is cheap and this is the boundary that keeps a proposal inside one game.
  return !relative.includes('..') && relative.length > 0;
}

export class ProposalBaseUnavailableError extends Error {
  constructor(
    message: string,
    readonly reason: 'not_published' | 'no_sources' | 'not_configured',
  ) {
    super(message);
    this.name = 'ProposalBaseUnavailableError';
  }
}

/**
 * Resolve the published sources a proposal against `slug` should start from.
 *
 * Store lane first, because a slug with a live publication record is authoritative there
 * regardless of what the repo also holds — the same precedence the play route uses. A slug
 * with no publication is a repo-lane game and is read from the archive.
 */
export async function resolveProposalBase(options: ProposalBaseOptions, slug: string): Promise<ProposalBaseSources> {
  const publication = await options.store.getPublication(slug);

  if (publication && options.gamesStore) {
    if (publication.state !== 'published') {
      throw new ProposalBaseUnavailableError(`${slug} is not published`, 'not_published');
    }
    const manifest = await options.gamesStore.getManifest(slug, publication.currentVersion);
    if (!manifest) {
      throw new ProposalBaseUnavailableError(`${slug}@${publication.currentVersion} has no manifest`, 'no_sources');
    }
    const entries = await Promise.all(
      manifest.sourceFiles.map(async (path) => {
        const content = await options.gamesStore!.getSourceFile(slug, publication.currentVersion, path);
        return content === null ? null : { path, content };
      }),
    );
    const files = entries.filter((entry): entry is SourceFile => entry !== null);
    if (files.length === 0) {
      throw new ProposalBaseUnavailableError(`${slug} has no readable sources`, 'no_sources');
    }
    return { base: { kind: 'store', version: publication.currentVersion }, files };
  }

  return resolveRepoBase(options, slug);
}

/**
 * A repo-lane game's sources, read out of the archive at the live snapshot's commit.
 *
 * The commit rather than a branch name on purpose: `main` moves, and a proposal built
 * against whatever `main` happened to be would describe a change to a game nobody is
 * playing. Pinning to what the *published snapshot* was baked from means the base is
 * exactly what a player is looking at when they decide to change it — which is also what
 * makes staleness detectable later.
 */
async function resolveRepoBase(options: ProposalBaseOptions, slug: string): Promise<ProposalBaseSources> {
  if (!options.snapshotStore || !options.gamesRepo || !options.gamesRepoToken) {
    throw new ProposalBaseUnavailableError('repo-lane proposals are not configured', 'not_configured');
  }

  const pointer = await options.snapshotStore.getPointer();
  if (!pointer?.commitSha) {
    // A snapshot with no recorded commit cannot anchor a proposal: there would be nothing
    // to apply the change onto later, and nothing to detect drift against.
    throw new ProposalBaseUnavailableError('the live snapshot has no recorded commit', 'not_configured');
  }

  const prefix = `games/${slug}/`;
  const archive = await fetchGamesRepoArchive({
    repo: options.gamesRepo,
    ref: pointer.commitSha,
    token: options.gamesRepoToken,
    fetchImpl: options.fetchImpl,
    // The scope boundary. Applied while the tar is being read, so nothing outside this one
    // game is ever held in memory, let alone handed to a proposer.
    include: (path) => path.startsWith(prefix),
    maxTotalBytes: MAX_GAME_ARCHIVE_BYTES,
  });

  const files: SourceFile[] = [];
  for (const path of archive.listPaths()) {
    const relative = path.slice(prefix.length);
    if (!isProposableRepoPath(relative)) continue;
    const content = await archive.readText(path, pointer.commitSha);
    if (content === null) continue;
    files.push({ path: relative, content });
  }

  if (files.length === 0) {
    throw new ProposalBaseUnavailableError(`no such game in the games repo: ${slug}`, 'no_sources');
  }

  return { base: { kind: 'repo', snapshotId: pointer.snapshotId, sha: pointer.commitSha }, files };
}

/**
 * Whether a repo-lane proposal's base is still the commit the site is serving.
 *
 * The store lane compares version ids (`isBaseStale`); this is its repo-lane twin. Both
 * answer the same question — "does this diff still describe a change to what is live" —
 * and both are asked at decision time as well as by the sweep, because a bake can land
 * between a reviewer opening a card and pressing accept.
 */
export function isRepoBaseStale(base: ProposalBase, pointer: { commitSha: string | null } | null): boolean {
  if (base.kind !== 'repo') return false;
  if (!pointer?.commitSha) return true;
  return base.sha !== pointer.commitSha;
}
