// Kit and sources mounted for vendors with workspaceArchiveDir.

import type { GamesStore } from '../delivery/games-store.js';
import type { GcsObjectStore } from '../delivery/gcs-sign.js';
import { parseKitRegistry } from '../platform/kit-registry.js';
import type { Store } from '../platform/store.js';
import type { BuildBrief } from './agent-backend.js';
import { loadRoundSources, type SourcesLog } from './agent-channel-sources.js';
import { readGateVerdict } from './gate-verdict.js';
import {
  ManagedAgentError,
  type ManagedAgentProvider,
  type ManagedSession,
  type ManagedSessionRequest,
} from './managed-agent.js';
import { sourceArchive } from './source-archive.js';
import { kickoffContextLines, loadKickoffContext, type KickoffContext } from './workspace-context.js';
import { loadReferenceArchives, referenceKickoffLines, type ReferenceStore } from './workspace-references.js';

export const KIT_ARCHIVE = 'kit.tgz';
export const SOURCES_ARCHIVE = 'sources.tgz';
// Where the agent unpacks; Anthropic's default working directory.
const WORKSPACE_ROOT = '/workspace';

export interface ManagedWorkspaceArchive {
  name: string;
  // Upload media type; archives are gzip.
  type?: string;
  bytes: Uint8Array;
}

export interface ManagedWorkspace {
  engineRef: string;
  // Set only when the archives carry the game's files.
  slug?: string;
  // A seed still needs get_sources for its references and notes.
  delivered?: boolean;
  // The last verdict was kit_outdated; get_kit marks the refresh.
  kitOutdated?: boolean;
  // Inlined round data; absent when it could not be read.
  context?: KickoffContext;
  // Mounted creator reference images, newest first.
  references?: string[];
  // Runs once the vendor took the archives.
  onMounted?: () => Promise<void>;
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
  store: Pick<Store, 'getSubmission' | 'pinRoundKitEngineRef' | 'listPendingCreatorMessages' | 'getCreatorNotes'> &
    ReferenceStore &
    Parameters<typeof loadRoundSources>[0];
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
    // get_kit's choice: the round pin, unless kit_outdated forced current.
    const outdated = (await readGateVerdict(deps.gamesStore, record))?.status === 'kit_outdated';
    const pinned = outdated ? undefined : record.roundKitEngineRef;
    const pinnedKit = pinned && pinned !== current ? await deps.objectStore.readObject(`kits/${pinned}.tgz`) : null;
    const engineRef = pinnedKit ? pinned! : current;
    const kit = pinnedKit ?? (await deps.objectStore.readObject(`kits/${current}.tgz`));
    if (!kit) return null;
    // Pinned as get_kit would; a failed pin drops the workspace.
    const replace = outdated || (pinned !== undefined && pinned !== engineRef);
    const held = await deps.store.pinRoundKitEngineRef(brief.jobId, engineRef, replace);
    if (held && held !== engineRef) throw new Error(`round pinned ${held} while mounting ${engineRef}`);
    const archives: ManagedWorkspaceArchive[] = [{ name: KIT_ARCHIVE, bytes: kit }];
    const sources = await loadRoundSources(deps.store, deps.gamesStore, record, undefined, deps.log);
    const kitOutdated = outdated || undefined;
    const context = await loadKickoffContext(deps.store, record, sources.kind).catch(() => undefined);
    // Images are a bonus: a failed read leaves the get_reference_images path.
    const refs = await loadReferenceArchives(deps.store, record).catch(() => null);
    const mounted = refs?.archives.length
      ? { references: refs.archives.map((ref) => ref.name), onMounted: refs.markSeen }
      : {};
    archives.push(...(refs?.archives ?? []));
    if (sources.kind !== 'seed' && sources.kind !== 'delivery')
      return { engineRef, kitOutdated, context, ...mounted, archives };
    archives.push({ name: SOURCES_ARCHIVE, bytes: sourceArchive(sources.files, sources.slug) });
    return {
      engineRef,
      slug: sources.slug,
      delivered: sources.kind === 'delivery',
      kitOutdated,
      context,
      ...mounted,
      archives,
    };
  };
}

// Kickoff lines for a mounted workspace, in place of the download steps.
export function workspaceKickoff(dir: string, workspace: ManagedWorkspace): string[] {
  const kitDir = `${WORKSPACE_ROOT}/gamedevpl-creator-kit`;
  const unpack = [
    'npm config set update-notifier false',
    `mkdir -p ${WORKSPACE_ROOT}`,
    `tar xzf ${dir}/${KIT_ARCHIVE} -C ${WORKSPACE_ROOT}`,
    ...(workspace.slug ? [`tar xzf ${dir}/${SOURCES_ARCHIVE} -C ${kitDir}/games`] : []),
    `cd ${kitDir}`,
    'npm ci --ignore-scripts',
  ].join(' && ');
  const game = workspace.slug
    ? `the round's current files of this game in \`games/${workspace.slug}/\``
    : 'an empty `games/` — write the files `get_sources` returns into `games/<slug>/`';
  const remount = `move \`games/\` aside, delete the kit directory, extract its kitUrl into ${WORKSPACE_ROOT}, move \`games/\` back and run \`npm ci --ignore-scripts\` again`;
  return [
    `Your workspace is already mounted. Run once: \`${unpack}\`.`,
    `It holds Creator Kit ${workspace.engineRef} and ${game}; do not download the kit or the sources archive${workspace.delivered ? ' and do not call `get_sources`, which returns the same files' : ''}. Revise those files; never scaffold over them.`,
    workspace.kitOutdated
      ? `This kit replaces the one the last delivery was refused for (kit_outdated): call \`get_kit\` once. If its kitEngineRef is not ${workspace.engineRef}, ${remount}. Submit with get_kit's kitEngineRef.`
      : `Submit with kitEngineRef ${workspace.engineRef}; no \`get_kit\` call is needed. Only if \`submit_sources\` refuses it with kit_outdated: call \`get_kit\`, ${remount}.`,
    'Edit there and typecheck from the kit root before each submit, as the system prompt describes.',
    ...referenceKickoffLines(dir, workspace.references ?? []),
    ...(workspace.context ? kickoffContextLines(workspace.context) : []),
  ];
}

// A stalled storage read must not hold the dispatch.
const WORKSPACE_LOAD_TIMEOUT_MS = 20_000;

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`workspace load exceeded ${ms} ms`)), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

// A refused upload retries the round without the workspace.
export async function startWithWorkspace(
  provider: Pick<ManagedAgentProvider, 'startSession' | 'workspaceArchiveDir'>,
  load: (() => Promise<ManagedWorkspace | null>) | undefined,
  request: ManagedSessionRequest,
  promptWith: (kickoff: string[], workspace: ManagedWorkspace) => string,
  log?: { warn: (context: object, message: string) => void },
  loadTimeoutMs = WORKSPACE_LOAD_TIMEOUT_MS,
): Promise<ManagedSession> {
  const dir = provider.workspaceArchiveDir;
  const workspace =
    dir && load
      ? await withDeadline(load(), loadTimeoutMs).catch((error: unknown) => {
          log?.warn({ err: error }, 'managed workspace could not be assembled; starting without it');
          return null;
        })
      : null;
  if (!dir || !workspace) return provider.startSession(request);
  try {
    const prompt = promptWith(workspaceKickoff(dir, workspace), workspace);
    const session = await provider.startSession({ ...request, prompt, workspaceArchives: workspace.archives });
    await workspace
      .onMounted?.()
      .catch((error: unknown) => log?.warn({ err: error }, 'mounted references not marked seen'));
    return session;
  } catch (error) {
    if (!(error instanceof ManagedWorkspaceError)) throw error;
    log?.warn({ err: error }, 'managed workspace upload failed; starting without it');
    return provider.startSession(request);
  }
}
