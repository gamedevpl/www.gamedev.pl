// Kit and sources mounted for vendors with workspaceArchiveDir.

import type { GamesStore } from '../delivery/games-store.js';
import type { GcsObjectStore } from '../delivery/gcs-sign.js';
import { parseKitRegistry } from '../platform/kit-registry.js';
import type { Store } from '../platform/store.js';
import type { BuildBrief } from './agent-backend.js';
import { loadRoundSources, type SourcesLog } from './agent-channel-sources.js';
import {
  ManagedAgentError,
  type ManagedAgentProvider,
  type ManagedSession,
  type ManagedSessionRequest,
} from './managed-agent.js';
import { sourceArchive } from './source-archive.js';

export const KIT_ARCHIVE = 'kit.tgz';
export const SOURCES_ARCHIVE = 'sources.tgz';
// Where the agent unpacks; Anthropic's default working directory.
const WORKSPACE_ROOT = '/workspace';

export interface ManagedWorkspaceArchive {
  name: string;
  bytes: Uint8Array;
}

export interface ManagedWorkspace {
  engineRef: string;
  // Set only when the archives carry the game's files.
  slug?: string;
  archives: ManagedWorkspaceArchive[];
}

export type ManagedWorkspaceLoader = (brief: BuildBrief) => Promise<ManagedWorkspace | null>;

// The vendor could not take the archives; the round starts without them.
export class ManagedWorkspaceError extends ManagedAgentError {
  constructor(message: string, status?: number) {
    super(message, status);
    this.name = 'ManagedWorkspaceError';
  }
}

export interface ManagedWorkspaceDeps {
  store: Pick<Store, 'getSubmission'> & Parameters<typeof loadRoundSources>[0];
  gamesStore: GamesStore;
  objectStore: Pick<GcsObjectStore, 'readObject'>;
  log: SourcesLog;
}

// Null without a published kit; the agent then uses get_kit.
export function createManagedWorkspaceLoader(deps: ManagedWorkspaceDeps): ManagedWorkspaceLoader {
  return async (brief) => {
    const record = await deps.store.getSubmission(brief.jobId);
    if (!record) return null;
    const registry = await deps.objectStore.readObject('kits/current.json');
    if (!registry) return null;
    const current = parseKitRegistry(registry.toString('utf8')).current;
    // The pin get_kit honours, so both report one kit.
    const pinned = record.roundKitEngineRef;
    const pinnedKit = pinned && pinned !== current ? await deps.objectStore.readObject(`kits/${pinned}.tgz`) : null;
    const engineRef = pinnedKit ? pinned! : current;
    const kit = pinnedKit ?? (await deps.objectStore.readObject(`kits/${current}.tgz`));
    if (!kit) return null;
    const archives: ManagedWorkspaceArchive[] = [{ name: KIT_ARCHIVE, bytes: kit }];
    const sources = await loadRoundSources(deps.store, deps.gamesStore, record, undefined, deps.log);
    if (sources.kind !== 'seed' && sources.kind !== 'delivery') return { engineRef, archives };
    archives.push({ name: SOURCES_ARCHIVE, bytes: sourceArchive(sources.files, sources.slug) });
    return { engineRef, slug: sources.slug, archives };
  };
}

// Kickoff lines for a mounted workspace, in place of the download steps.
export function workspaceKickoff(dir: string, workspace: ManagedWorkspace): string[] {
  const kitDir = `${WORKSPACE_ROOT}/gamedevpl-creator-kit`;
  const unpack = [
    `mkdir -p ${WORKSPACE_ROOT}`,
    `tar xzf ${dir}/${KIT_ARCHIVE} -C ${WORKSPACE_ROOT}`,
    ...(workspace.slug ? [`tar xzf ${dir}/${SOURCES_ARCHIVE} -C ${kitDir}/games`] : []),
    `cd ${kitDir}`,
    'npm ci --ignore-scripts',
  ].join(' && ');
  const game = workspace.slug
    ? `the round's current files of this game in \`games/${workspace.slug}/\``
    : 'an empty `games/` — write the files `get_sources` returns into `games/<slug>/`';
  return [
    `Your workspace is already mounted. Run once: \`${unpack}\`.`,
    `It holds Creator Kit ${workspace.engineRef} and ${game}; do not download the kit or the sources archive.`,
    `Call \`get_kit\` only for kitEngineRef; if it is not ${workspace.engineRef}, extract its kitUrl into ${WORKSPACE_ROOT} instead.`,
    'Edit there and run `npm run typecheck -- <slug>` from the kit root before each submit.',
  ];
}

// A refused upload retries the round without the workspace.
export async function startWithWorkspace(
  provider: Pick<ManagedAgentProvider, 'startSession' | 'workspaceArchiveDir'>,
  load: (() => Promise<ManagedWorkspace | null>) | undefined,
  request: ManagedSessionRequest,
  promptWith: (kickoff: string[]) => string,
  log?: { warn: (context: object, message: string) => void },
): Promise<ManagedSession> {
  const dir = provider.workspaceArchiveDir;
  const workspace =
    dir && load
      ? await load().catch((error: unknown) => {
          log?.warn({ err: error }, 'managed workspace could not be assembled; starting without it');
          return null;
        })
      : null;
  if (!dir || !workspace) return provider.startSession(request);
  try {
    const prompt = promptWith(workspaceKickoff(dir, workspace));
    return await provider.startSession({ ...request, prompt, workspaceArchives: workspace.archives });
  } catch (error) {
    if (!(error instanceof ManagedWorkspaceError)) throw error;
    log?.warn({ err: error }, 'managed workspace upload failed; starting without it');
    return provider.startSession(request);
  }
}
