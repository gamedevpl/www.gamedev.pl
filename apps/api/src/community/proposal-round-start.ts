import { EDITOR_FILE, parseEditorDefinition, type EditorDefinition } from '../creation/editor-contract.js';
import type { GamesStore, SourceFile, VersionManifest } from '../delivery/games-store.js';
import { reserveActorAndGameQuota } from '../platform/game-quota.js';
import { rejectionFor, type ContentChecker } from '../platform/moderation.js';
import { logModerationRejection } from '../platform/moderation-metrics.js';
import type { ProposalRecord, Store } from '../platform/store.js';
import {
  applyProposalData,
  summarizeProposalChange,
  type EditorBake,
  type EditorParams,
  type ProposalChangeSet,
} from './proposal-change-set.js';
import { buildProposalRoundBrief } from './proposal-round-brief.js';
import type { ProposalRoundOutcome, ProposalRoundStarter } from './proposals.js';

// Turns an accepted creator-game proposal into the owner's own round.

type ImprovementRound = (input: {
  jobId: number;
  text: string;
  title: string;
  locale: string;
  log: { error: (context: object, message: string) => void };
  ownerUid?: string;
  beforeDispatch?: (jobId: number) => Promise<boolean>;
}) => Promise<{ route: 'job'; jobId: number } | { route: 'unavailable'; reason: string } | null>;

// Creation's content-only candidate path: new job, linked, then delivered.
export type ContentDelivery = (input: {
  slug: string;
  ownerUid: string;
  title: string;
  locale?: string;
  files: SourceFile[];
  engineRef?: string;
  link: (jobId: number) => Promise<boolean>;
}) => Promise<{ ok: true; jobId: number } | { ok: false; error: string }>;

export interface ProposalRoundStartDeps {
  store: Store;
  gamesStore: GamesStore;
  startImprovementRound: ImprovementRound;
  // Creation's EditorKit helpers and content path, wired at the composition root.
  content: {
    bake: EditorBake;
    textFields: (
      definition: EditorDefinition | null,
      content?: Record<string, unknown>,
      params?: EditorParams,
    ) => string[];
    deliver: ContentDelivery;
  };
  contentChecker?: ContentChecker;
  dailyImprovementQuota: number;
  log: { error: (context: object, message: string) => void; warn: (context: object, message: string) => void };
  now?: () => number;
}

export interface LoadedProposalChange {
  liveVersion: string;
  liveManifest: VersionManifest;
  live: SourceFile[];
  proposed: SourceFile[];
  change: ProposalChangeSet;
}

export async function readVersionFiles(
  gamesStore: Pick<GamesStore, 'getManifest' | 'getSourceFile'>,
  slug: string,
  version: string,
): Promise<{ manifest: VersionManifest; files: SourceFile[] } | null> {
  const manifest = await gamesStore.getManifest(slug, version);
  if (!manifest) return null;
  const files: SourceFile[] = [];
  for (const path of manifest.sourceFiles) {
    const content = await gamesStore.getSourceFile(slug, version, path);
    if (content !== null) files.push({ path, content });
  }
  return { manifest, files };
}

// The proposal measured against what is live now, not its own base.
export async function loadProposalChange(
  store: Pick<Store, 'getPublication'>,
  gamesStore: Pick<GamesStore, 'getManifest' | 'getSourceFile'>,
  proposal: ProposalRecord,
): Promise<LoadedProposalChange | null> {
  const liveVersion = (await store.getPublication(proposal.targetSlug))?.currentVersion;
  if (!liveVersion || !proposal.version) return null;
  const live = await readVersionFiles(gamesStore, proposal.targetSlug, liveVersion);
  const proposed = await readVersionFiles(gamesStore, proposal.targetSlug, proposal.version);
  if (!live || !proposed) return null;
  return {
    liveVersion,
    liveManifest: live.manifest,
    live: live.files,
    proposed: proposed.files,
    change: summarizeProposalChange(live.files, proposed.files),
  };
}

function isSealed(manifest: VersionManifest): boolean {
  return manifest.sourceFiles.includes('TRACE.json') && manifest.sourceFiles.includes('PLAYTEST.json');
}

export function createProposalRoundStarter(deps: ProposalRoundStartDeps): ProposalRoundStarter {
  const now = deps.now ?? Date.now;
  const { store } = deps;

  // Moderates declared text the data path would ship.
  async function refuseDataText(
    live: SourceFile[],
    change: ProposalChangeSet,
    proposerUid: string,
  ): Promise<ProposalRoundOutcome | null> {
    if (!deps.contentChecker) return null;
    const editor = live.find((file) => file.path === EDITOR_FILE);
    const definition = editor ? parseEditorDefinition(editor.content).definition : null;
    const texts = deps.content.textFields(definition, change.data.content, change.data.params);
    if (texts.length === 0) return null;
    const verdict = await deps.contentChecker.checkFields(texts);
    if (!verdict.allowed) {
      logModerationRejection(deps.log, {
        surface: 'proposal',
        uid: proposerUid,
        category: verdict.category,
        unavailable: verdict.unavailable,
      });
      const rejection = rejectionFor(verdict);
      return { ok: false, status: rejection.status, error: rejection.error };
    }
    return null;
  }

  return async ({ proposal, ownerUid, link }): Promise<ProposalRoundOutcome> => {
    const slug = proposal.targetSlug;
    const source = await store.getSubmissionBySlug(slug);
    if (!source) return { ok: false, status: 409, error: 'no_source_job' };
    const loaded = await loadProposalChange(store, deps.gamesStore, proposal).catch((err: unknown) => {
      deps.log.error({ err, proposalId: proposal.id }, 'proposal change summary failed');
      return null;
    });

    // Declarative data needs no agent: apply it as a content-only candidate.
    const baked =
      loaded && isSealed(loaded.liveManifest)
        ? applyProposalData(loaded.live, loaded.proposed, loaded.change, deps.content.bake)
        : null;
    if (loaded && baked) {
      const refused = await refuseDataText(loaded.live, loaded.change, proposal.proposerUid);
      if (refused) return refused;
      const delivered = await deps.content.deliver({
        slug,
        ownerUid,
        title: source.title,
        locale: source.locale,
        files: baked,
        ...(loaded.liveManifest.engineRef ? { engineRef: loaded.liveManifest.engineRef } : {}),
        link: (jobId) => link(jobId, 'data'),
      });
      if (!delivered.ok) {
        const error = delivered.error === 'busy' ? 'round_in_progress' : delivered.error;
        return { ok: false, status: 409, error };
      }
      return { ok: true, jobId: delivered.jobId, route: 'data' };
    }

    let refusal: ProposalRoundOutcome | null = null;
    let linkedJobId: number | null = null;
    const started = await deps.startImprovementRound({
      jobId: source.jobId,
      text: buildProposalRoundBrief(proposal, loaded?.change ?? null),
      title: proposal.title,
      locale: source.locale ?? 'en',
      log: deps.log,
      ownerUid,
      beforeDispatch: async (jobId) => {
        const quota = await reserveActorAndGameQuota(store, {
          actorUid: ownerUid,
          slug,
          dateStr: new Date(now()).toISOString().slice(0, 10),
          actorLimit: deps.dailyImprovementQuota,
          gameLimit: deps.dailyImprovementQuota,
          action: 'improvements',
        });
        if (!quota.allowed) {
          const blocked = quota.tier === 'blocked';
          refusal = { ok: false, status: blocked ? 403 : 429, error: blocked ? 'account_blocked' : 'quota_exhausted' };
          return false;
        }
        if (!(await link(jobId, 'round'))) return false;
        linkedJobId = jobId;
        return true;
      },
    });
    const refused = refusal as ProposalRoundOutcome | null;
    if (refused) return refused;
    if (started?.route === 'unavailable') return { ok: false, status: 409, error: 'managed_unavailable' };
    // A failed dispatch leaves the linked job queued, a visible stall.
    const jobId = started?.jobId ?? (linkedJobId as number | null);
    if (jobId === null) return { ok: false, status: 502, error: 'round_failed' };
    return { ok: true, jobId, route: 'round' };
  };
}
