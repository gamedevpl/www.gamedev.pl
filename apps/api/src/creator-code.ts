import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assembleGameHtml, CredentialLeakError, EmptyProjectError, ProjectTooLargeError } from './catalog/assemble.js';
import { isActiveBuildRound } from './builder.js';
import { codeSurfaceEnabled, isLiveAgentRound, isOpenAgentRound } from './code-surface.js';
import type { GcsObjectStore } from './delivery/gcs-sign.js';
import {
  InvalidUploadError,
  MAX_UPLOAD_FILES,
  type GamesStore,
  type SourceFile,
  type StagedSourceEntry,
} from './delivery/games-store.js';
import type { TabCompleteGate } from './creation-limits.js';
import type { GitHubClient } from './catalog/github-client.js';
import { resolveJobState } from './job-state.js';
import { createKitFileStore, type KitFileStore } from './kit-files.js';
import { parseKitRegistry } from './kit-registry.js';
import {
  assessModuleSize,
  isGameTsModule,
  largeSourceFileHint,
  MODULE_SOFT_LIMIT_BYTES,
  MODULE_SOFT_LIMIT_LINES,
} from './module-size.js';
import { resolveRoundBaseVersion } from './round-base-version.js';
import { applyExactReplace, applySourcePatch, SourcePatchError } from './source-patch.js';
import {
  createSourceDeliveryService,
  SourceDeliveryValidationError,
  type SourceDeliveryService,
} from './delivery/source-delivery.js';
import {
  hasPlayableOverlay,
  overlayGameSources,
  readDeliveredSources,
  type StagedPreviewPublisher,
} from './delivery/staged-preview.js';
import type { Store, SubmissionRecord } from './store.js';
import { MAX_PREFIX_CHARS, MAX_SUFFIX_CHARS, tabCompleteEnabled, type TabCompleter } from './tab-complete.js';
import { sharedSourcesFromKitTree } from './typecheck-preflight.js';
import { typeCheckGame } from './type-check.js';

/**
 * The Code surface's own routes (creator-code-editing-execution-plan.md §2 Waves A/C):
 * an owner's read of their game's sources (CE-03), owner-authored staging writes that
 * are the twin of the agent channel's own (CE-10, CE-04's `stagedBy` stamp), and the
 * in-memory typecheck (CE-11). Registered beside `registerCreatorStudioRoutes` and
 * `registerEditorRoutes` in app.ts, sharing the same `store` / `gamesStore` /
 * `objectStore` those already hold.
 *
 * Every route here 404s (never 403) for a slug the caller does not own — the workspace
 * checkout route's own posture, restated in CE-03: a creator has no reason to learn
 * which other slugs exist. Every route also 404s when {@link codeSurfaceEnabled}
 * (CE-02) is off, which is the kill switch's whole point: absent the flag, the surface
 * must look like it was never built, not like it errored.
 */

export interface CreatorCodeRoutesOptions {
  store: Store;
  gamesStore?: GamesStore;
  objectStore?: GcsObjectStore;
  /** Test/production kit resolution seam; defaults to a fresh store over `objectStore`. */
  kitFileStore?: KitFileStore | null;
  // Track 2: the fast-lane synchronous preview route's engine half.
  githubClient?: Pick<GitHubClient, 'getGameSources'>;
  engineRef?: string;
  stagedPreviews?: Pick<StagedPreviewPublisher, 'publishCandidate'> | null;
  now?: () => number;
  /** Busts the cached status response after an owner write — see submissions.ts. */
  invalidateStatusCache?: (issueNumber: number) => void;
  /** Arms the staged-preview publisher — the CE-12 fix's other half lives here: an
   * owner write has to feed the same assembly an agent write does, or the "stage
   * refreshes" fix on the read side has nothing to read. */
  scheduleStagedPreview?: (issueNumber: number) => void;
  // TA-01: the ghost-text completer. Built unconditionally; TAB_COMPLETE gates the route.
  tabCompleter?: TabCompleter;
  // Shared daily token budget for ghost text — same chassis as editingGate.
  tabCompleteGate?: TabCompleteGate;
  dailyTabCompleteQuota?: number;
  /** Starts the gate on a manual delivery — the same trigger the agent channel uses. */
  onSourcesDelivered?: (input: {
    issueNumber: number;
    slug: string;
    version: string;
    mode?: 'health' | 'preview' | 'proposal';
  }) => Promise<{ buildId?: string; accepted?: boolean } | void> | void;
  sourceDelivery?: SourceDeliveryService | null;
  mintStatusToken?: (issueNumber: number) => string;
  log?: {
    warn: (context: object, message: string) => void;
    error: (context: object, message: string) => void;
    info?: (context: object, message: string) => void;
  };
}

/** CE-19: floor between two manual deliveries on the same game, copied from EditorKit. */
export const DELIVER_COOLDOWN_MS = 10 * 60 * 1000;

// TA-01: per-creator daily ceiling on completion calls, generous for typing.
export const DEFAULT_DAILY_TAB_COMPLETE_QUOTA = 2000;

/** One entry in the merged "what the next delivery would contain" file list (CE-03). */
export interface CreatorCodeFile {
  path: string;
  content: string;
  /** Present only for a file the staging buffer overrides — absent means "as delivered". */
  stagedBy?: 'agent' | 'owner';
  // Delivered content this staged edit overrides — lets the client diff live.
  base?: string;
  /** True when this path is staged for deletion (excluded from `files`, listed separately). */
  budget?: { bytes: number; lines: number; maxBytes: number; maxLines: number; oversize: boolean };
}

function requireUser(
  request: { user?: { uid: string; tier?: string } | null },
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
): boolean {
  if (!request.user) {
    reply.status(401).send({ error: 'authentication required' });
    return false;
  }
  if (request.user.tier === 'blocked') {
    reply.status(403).send({ error: 'account is blocked' });
    return false;
  }
  return true;
}

const SLUG_PARAM_PATTERN = /^[a-z0-9][a-z0-9-]{0,60}$/;

/**
 * The newest non-abandoned, non-canceled round this uid owns for this slug — the same
 * "newest round" preference `get_sources` and the workspace checkout route both use, and
 * for the same reason: an improvement round starts empty on a slug whose older job still
 * points at what it delivered before publication, so scanning the wrong record would
 * hand an owner's edit back a stale base to overwrite newer published work.
 */
async function resolveOwnedRecord(store: Store, uid: string, slug: string): Promise<SubmissionRecord | null> {
  const records = await store.listSubmissionsByOwner(uid);
  const owned = records.filter((record) => record.slug === slug && !record.abandonedAt && record.state !== 'canceled');
  if (owned.length === 0) return null;
  return [...owned].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]!;
}

// The delivery this round builds on — see round-base-version.ts.
async function resolveVersion(store: Store, record: SubmissionRecord, slug: string): Promise<string | null> {
  return resolveRoundBaseVersion(store, record, slug);
}

// A SPEC.md from what the record knows: title, slug, the brief.

// genre/controls/submitted_by stay for the creator, never guessed.
export function buildSpecStub(record: Pick<SubmissionRecord, 'title' | 'slug' | 'spec'>): string {
  // Frontmatter is line-based; a title is one line.
  const title = record.title?.replace(/\s+/g, ' ').trim() || record.slug || 'Untitled game';
  // YAML-safe without a serializer.
  const quote = (value: string) => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
  const brief = record.spec?.trim();
  return [
    '---',
    `title: ${quote(title)}`,
    ...(record.slug ? [`slug: ${quote(record.slug)}`] : []),
    '---',
    '',
    `# ${title}`,
    '',
    brief || 'Describe the game here — what the player does, how a round starts and ends.',
    '',
    '<!-- Add genre, controls and submitted_by to the frontmatter above before publishing. -->',
    '',
  ].join('\n');
}

function budgetFor(path: string, content: string): CreatorCodeFile['budget'] {
  if (!isGameTsModule(path)) return undefined;
  const assessment = assessModuleSize(path, content);
  return {
    bytes: assessment.bytes,
    lines: assessment.lines,
    maxBytes: MODULE_SOFT_LIMIT_BYTES,
    maxLines: MODULE_SOFT_LIMIT_LINES,
    oversize: assessment.oversize,
  };
}

export async function registerCreatorCodeRoutes(
  app: FastifyInstance,
  options: CreatorCodeRoutesOptions,
): Promise<void> {
  const { store } = options;
  const kitFileStore =
    options.kitFileStore !== undefined
      ? options.kitFileStore
      : options.objectStore
        ? createKitFileStore(options.objectStore)
        : null;
  const sourceDelivery: SourceDeliveryService | null =
    options.sourceDelivery !== undefined
      ? options.sourceDelivery
      : options.gamesStore
        ? createSourceDeliveryService({
            store: options.store,
            gamesStore: options.gamesStore,
            kitFileStore,
            stagedPreviews: options.stagedPreviews,
            onSourcesDelivered: options.onSourcesDelivered,
            onEvent: (issueNumber) => options.scheduleStagedPreview?.(issueNumber),
            log: options.log,
          })
        : null;
  /** CE-19: per-slug cooldown between manual deliveries. Process-local, same posture
   * as source-delivery.ts's own per-build rate limiter. */
  const lastDeliverAt = new Map<string, number>();

  function notFoundIfDisabled(reply: { status: (code: number) => { send: (body: unknown) => unknown } }): boolean {
    if (codeSurfaceEnabled()) return false;
    reply.status(404).send({ error: 'not found' });
    return true;
  }

  // Closed round: staging would write into a buffer nothing reads again.
  function roundIsClosed(record: SubmissionRecord): boolean {
    const resolvedState = resolveJobState(record) ?? 'queued';
    return !isActiveBuildRound({ state: resolvedState, transitions: record.transitions });
  }

  // CE-17: opens a fresh job, `published` forbids reopening one in place.
  async function openManualRound(store: Store, source: SubmissionRecord, slug: string): Promise<SubmissionRecord> {
    const jobId = await store.allocateJobId();
    await store.createSubmission(jobId, source.ownerUid, source.title);
    await store.setSubmissionSlug(jobId, slug);
    await store.setSubmissionLocale(jobId, source.locale ?? 'en');
    await store.recordJobTransition(jobId, {
      to: 'queued',
      at: new Date().toISOString(),
      by: 'creator',
      reason: 'code_surface_opened',
    });
    // Carry the version forward — else its first write sees no base.
    const baseVersion = await resolveRoundBaseVersion(store, source, slug);
    if (baseVersion) await store.setSubmissionPreviewVersion(jobId, baseVersion);
    return (await store.getSubmission(jobId)) ?? { ...source, issueNumber: jobId, roundGeneration: undefined };
  }

  /** Owner-resolved round + version, or the exact reply already sent on failure. */
  async function resolveForSlug(
    request: { user?: { uid: string; tier?: string } | null; params: { slug: string } },
    reply: {
      status: (code: number) => { send: (body: unknown) => unknown };
    },
  ): Promise<{ record: SubmissionRecord; slug: string } | null> {
    if (!requireUser(request, reply)) return null;
    const slug = request.params.slug;
    if (!SLUG_PARAM_PATTERN.test(slug)) {
      reply.status(400).send({ error: 'invalid slug' });
      return null;
    }
    const record = await resolveOwnedRecord(store, request.user!.uid, slug);
    if (!record) {
      reply.status(404).send({ error: 'no such game' });
      return null;
    }
    return { record, slug };
  }

  /**
   * GET /api/me/studio/games/:slug/sources (CE-03).
   *
   * Owner-authed, owner-resolved like the workspace route. Returns the manifest's file
   * list and text, merged with the staging overlay (per-file `stagedBy`, CE-04), so the
   * response is "what the next delivery would contain" — not just what was last
   * delivered.
   *
   * The limit has to clear CodeSurface.tsx's own read-only poll (every 4s while an
   * agent round is live, ~900/hour) with headroom for ordinary navigation — a limit
   * sized only for the initial load would 429 that poll into a permanent error screen
   * a couple minutes into watching an agent work.
   */
  app.get<{ Params: { slug: string } }>(
    '/api/me/studio/games/:slug/sources',
    { config: { rateLimit: { max: 1200, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (notFoundIfDisabled(reply)) return;
      if (!options.gamesStore) {
        return reply.status(503).send({ error: 'the Code surface is not configured on this deployment' });
      }
      const resolved = await resolveForSlug(request, reply);
      if (!resolved) return;
      const { record, slug } = resolved;
      const gamesStore = options.gamesStore;

      const version = await resolveVersion(store, record, slug);
      const roundGeneration = record.roundGeneration ?? 1;

      const [manifest, stagedSummary, stagedContents] = await Promise.all([
        version ? gamesStore.getManifest(slug, version) : Promise.resolve(null),
        gamesStore.listStagedSources({ slug, issueNumber: record.issueNumber, roundGeneration }),
        gamesStore.getStagedSourceFiles({ slug, issueNumber: record.issueNumber, roundGeneration }),
      ]);

      if (version && !manifest) {
        request.log.error({ slug, version }, 'code surface: manifest missing for a version a job points at');
        return reply.status(502).send({ error: 'the delivered version could not be read back' });
      }

      const baseContentByPath = new Map<string, string>();
      if (manifest) {
        const reads = await Promise.all(
          manifest.sourceFiles.map(async (path) => ({
            path,
            content: await gamesStore.getSourceFile(slug, version!, path),
          })),
        );
        const missing = reads.filter((entry) => entry.content === null).map((entry) => entry.path);
        if (missing.length > 0) {
          request.log.error({ slug, version, missing }, 'code surface: version is missing files its manifest lists');
          return reply.status(502).send({ error: 'the delivered version could not be read back' });
        }
        for (const entry of reads) baseContentByPath.set(entry.path, entry.content!);
      }

      const stagedEntryByPath = new Map<string, StagedSourceEntry>(
        stagedSummary.files.map((file) => [file.path, file]),
      );
      const stagedContentByPath = new Map(stagedContents.map((file) => [file.path, file]));

      const allPaths = new Set<string>([...baseContentByPath.keys(), ...stagedEntryByPath.keys()]);
      const files: CreatorCodeFile[] = [];
      const deleted: string[] = [];
      for (const path of [...allPaths].sort()) {
        const stagedEntry = stagedEntryByPath.get(path);
        if (stagedEntry?.deleted) {
          deleted.push(path);
          continue;
        }
        if (stagedEntry) {
          const content = stagedContentByPath.get(path)?.content ?? '';
          const base = baseContentByPath.get(path);
          files.push({
            path,
            content,
            stagedBy: stagedEntry.stagedBy ?? 'agent',
            ...(base !== undefined ? { base } : {}),
            budget: budgetFor(path, content),
          });
          continue;
        }
        const content = baseContentByPath.get(path);
        if (content === undefined) continue;
        files.push({ path, content, budget: budgetFor(path, content) });
      }

      const liveAgent = isLiveAgentRound(record);
      return reply.send({
        slug,
        version,
        files,
        deleted,
        readOnly: liveAgent,
        ...(liveAgent ? { reason: 'agent_round' as const } : {}),
        // Round is open to agent writes, so this snapshot can go stale.
        agentRound: isOpenAgentRound(record),
        staged: {
          totalBytes: stagedSummary.totalBytes,
          maxBytes: stagedSummary.maxBytes,
          maxFiles: stagedSummary.maxFiles,
          updatedAt: stagedSummary.updatedAt,
        },
      });
    },
  );

  const StageInputSchema = z.object({
    path: z.string().trim().min(1).max(120),
    content: z.string().max(1_000_000),
    /**
     * CE-13: autosave and the stage rebuild are deliberately separate acts in the
     * inverted layout — an automatic rebuild would change the game behind the
     * creator's panel while they are still typing. Default `true` (unset) matches
     * the agent channel's own behaviour, where every staged file is meant to reach
     * the stage; the owner-authored editor's autosave passes `false` and drives the
     * rebuild only from the explicit "Stage it" route below.
     */
    rebuild: z.boolean().optional(),
    // CE-20: tool-written, not typed.
    agentAuthored: z.boolean().optional(),
  });

  /** PUT /api/me/studio/games/:slug/sources/stage (CE-10) — the owner twin of the agent channel's stage route. */
  app.put<{ Params: { slug: string } }>(
    '/api/me/studio/games/:slug/sources/stage',
    { config: { rateLimit: { max: 300, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (notFoundIfDisabled(reply)) return;
      if (!options.gamesStore) {
        return reply.status(503).send({ error: 'the Code surface is not configured on this deployment' });
      }
      const resolved = await resolveForSlug(request, reply);
      if (!resolved) return;
      const { record, slug } = resolved;

      if (isLiveAgentRound(record)) {
        return reply.status(409).send({ error: 'agent_round', message: 'an agent is actively building this round' });
      }
      const activeRecord = roundIsClosed(record) ? await openManualRound(store, record, slug) : record;

      const parsed = StageInputSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      const roundGeneration =
        (await store.ensureRoundGeneration(activeRecord.issueNumber)) ?? activeRecord.roundGeneration ?? 1;

      try {
        const staged = await options.gamesStore.putStagedSourceFile({
          slug,
          issueNumber: activeRecord.issueNumber,
          roundGeneration,
          path: parsed.data.path,
          content: parsed.data.content,
          stagedBy: 'owner',
          agentAssisted: parsed.data.agentAuthored === true,
        });
        options.invalidateStatusCache?.(activeRecord.issueNumber);
        if (parsed.data.rebuild !== false) options.scheduleStagedPreview?.(activeRecord.issueNumber);
        const hint = largeSourceFileHint(staged.path, staged.bytes, parsed.data.content);
        return reply.send({
          accepted: true,
          path: staged.path,
          bytes: staged.bytes,
          ...(hint ? { hint } : {}),
          ...(activeRecord.issueNumber !== record.issueNumber ? { roundOpened: activeRecord.issueNumber } : {}),
          staged: {
            totalBytes: staged.totalBytes,
            maxBytes: staged.maxBytes,
            maxFiles: staged.maxFiles,
            updatedAt: staged.updatedAt,
          },
        });
      } catch (error) {
        if (error instanceof InvalidUploadError) {
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  const DeleteFileInputSchema = z.object({
    path: z.string().trim().min(1).max(120),
  });

  // Owner twin of the agent channel delete route (CE-10).
  app.post<{ Params: { slug: string } }>(
    '/api/me/studio/games/:slug/sources/stage/delete',
    { config: { rateLimit: { max: 300, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (notFoundIfDisabled(reply)) return;
      if (!options.gamesStore) {
        return reply.status(503).send({ error: 'the Code surface is not configured on this deployment' });
      }
      const resolved = await resolveForSlug(request, reply);
      if (!resolved) return;
      const { record, slug } = resolved;

      if (isLiveAgentRound(record)) {
        return reply.status(409).send({ error: 'agent_round', message: 'an agent is actively building this round' });
      }
      const activeRecord = roundIsClosed(record) ? await openManualRound(store, record, slug) : record;

      const parsed = DeleteFileInputSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      const roundGeneration =
        (await store.ensureRoundGeneration(activeRecord.issueNumber)) ?? activeRecord.roundGeneration ?? 1;

      try {
        const staged = await options.gamesStore.deleteStagedSourceFile({
          slug,
          issueNumber: activeRecord.issueNumber,
          roundGeneration,
          path: parsed.data.path,
          stagedBy: 'owner',
        });
        options.invalidateStatusCache?.(activeRecord.issueNumber);
        options.scheduleStagedPreview?.(activeRecord.issueNumber);
        return reply.send({
          accepted: true,
          path: staged.path,
          ...(activeRecord.issueNumber !== record.issueNumber ? { roundOpened: activeRecord.issueNumber } : {}),
          staged: {
            totalBytes: staged.totalBytes,
            maxBytes: staged.maxBytes,
            maxFiles: staged.maxFiles,
            updatedAt: staged.updatedAt,
          },
        });
      } catch (error) {
        if (error instanceof InvalidUploadError) {
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  const PatchInputSchema = z
    .object({
      path: z.string().trim().min(1).max(120),
      patch: z
        .string()
        .transform((value) => value.trim())
        .pipe(z.string().min(1, 'patch must not be empty').max(400_000))
        .optional(),
      old: z.string().max(200_000).optional(),
      new: z.string().max(200_000).optional(),
      // CE-20: tool-written, not typed.
      agentAuthored: z.boolean().optional(),
    })
    .superRefine((value, ctx) => {
      const hasPatch = value.patch !== undefined;
      const hasOld = value.old !== undefined;
      const hasNew = value.new !== undefined;
      if (hasPatch && (hasOld || hasNew)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'pass either patch or old+new, not both' });
        return;
      }
      if (hasOld !== hasNew) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'old and new must be passed together' });
        return;
      }
      if (!hasPatch && !hasOld) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'pass old+new or patch' });
      }
    });

  /** POST /api/me/studio/games/:slug/sources/stage/patch (CE-10). */
  app.post<{ Params: { slug: string } }>(
    '/api/me/studio/games/:slug/sources/stage/patch',
    { config: { rateLimit: { max: 300, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (notFoundIfDisabled(reply)) return;
      if (!options.gamesStore) {
        return reply.status(503).send({ error: 'the Code surface is not configured on this deployment' });
      }
      const resolved = await resolveForSlug(request, reply);
      if (!resolved) return;
      const { record, slug } = resolved;

      if (isLiveAgentRound(record)) {
        return reply.status(409).send({ error: 'agent_round', message: 'an agent is actively building this round' });
      }
      const activeRecord = roundIsClosed(record) ? await openManualRound(store, record, slug) : record;

      const parsed = PatchInputSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      const roundGeneration =
        (await store.ensureRoundGeneration(activeRecord.issueNumber)) ?? activeRecord.roundGeneration ?? 1;
      const gamesStore = options.gamesStore;

      try {
        const stagedContent = await gamesStore.getStagedSourceFile({
          slug,
          issueNumber: activeRecord.issueNumber,
          roundGeneration,
          path: parsed.data.path,
        });

        let base = stagedContent;
        let baseFrom: 'staged' | 'delivery' | null = stagedContent !== null ? 'staged' : null;
        if (base === null) {
          const version = await resolveVersion(store, activeRecord, slug);
          if (version) {
            base = await gamesStore.getSourceFile(slug, version, parsed.data.path);
            if (base !== null) baseFrom = 'delivery';
          }
        }
        if (base === null || baseFrom === null) {
          return reply.status(400).send({
            error: `cannot patch ${parsed.data.path}: no base content in staging or the latest delivery — send the full file first`,
          });
        }

        const patched =
          parsed.data.old !== undefined && parsed.data.new !== undefined
            ? applyExactReplace({ content: base, path: parsed.data.path, old: parsed.data.old, new: parsed.data.new })
            : applySourcePatch({ content: base, path: parsed.data.path, patch: parsed.data.patch! });

        const staged = await gamesStore.putStagedSourceFile({
          slug,
          issueNumber: activeRecord.issueNumber,
          roundGeneration,
          path: parsed.data.path,
          content: patched.content,
          stagedBy: 'owner',
          agentAssisted: parsed.data.agentAuthored === true,
        });
        options.invalidateStatusCache?.(activeRecord.issueNumber);
        options.scheduleStagedPreview?.(activeRecord.issueNumber);
        const hint = largeSourceFileHint(staged.path, staged.bytes, patched.content);
        return reply.send({
          accepted: true,
          path: staged.path,
          bytes: staged.bytes,
          replacements: patched.replacements,
          baseFrom,
          ...(hint ? { hint } : {}),
          ...(activeRecord.issueNumber !== record.issueNumber ? { roundOpened: activeRecord.issueNumber } : {}),
          staged: {
            totalBytes: staged.totalBytes,
            maxBytes: staged.maxBytes,
            maxFiles: staged.maxFiles,
            updatedAt: staged.updatedAt,
          },
        });
      } catch (error) {
        if (error instanceof SourcePatchError || error instanceof InvalidUploadError) {
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  const DiscardInputSchema = z.object({
    paths: z.array(z.string().trim().min(1).max(120)).max(MAX_UPLOAD_FILES).optional(),
  });

  /**
   * POST /api/me/studio/games/:slug/sources/stage/discard (CE-10) — owner-scoped
   * clear. Only clears paths this owner staged (`stagedBy === 'owner'`); an agent's own
   * staged work in a mixed buffer is left standing, because "discard my edits" must not
   * also discard an agent's.
   */
  app.post<{ Params: { slug: string } }>(
    '/api/me/studio/games/:slug/sources/stage/discard',
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (notFoundIfDisabled(reply)) return;
      if (!options.gamesStore) {
        return reply.status(503).send({ error: 'the Code surface is not configured on this deployment' });
      }
      const resolved = await resolveForSlug(request, reply);
      if (!resolved) return;
      const { record, slug } = resolved;

      if (isLiveAgentRound(record)) {
        return reply.status(409).send({ error: 'agent_round', message: 'an agent is actively building this round' });
      }

      const parsed = DiscardInputSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      const roundGeneration = record.roundGeneration ?? 1;
      const summary = await options.gamesStore.listStagedSources({
        slug,
        issueNumber: record.issueNumber,
        roundGeneration,
      });
      const ownerPaths = new Set(summary.files.filter((file) => file.stagedBy === 'owner').map((file) => file.path));
      const requested = parsed.data.paths;
      const paths = requested ? requested.filter((path) => ownerPaths.has(path)) : [...ownerPaths];

      if (paths.length === 0) {
        return reply.send({ cleared: 0 });
      }

      const result = await options.gamesStore.clearStagedSources({
        slug,
        issueNumber: record.issueNumber,
        roundGeneration,
        paths,
      });
      options.invalidateStatusCache?.(record.issueNumber);
      // Rebuild so Play drops the cancelled draft.
      options.scheduleStagedPreview?.(record.issueNumber);
      return reply.send(result);
    },
  );

  const RestoreInputSchema = z.object({ path: z.string().trim().min(1).max(120) });

  // POST /sources/stage/restore — supplies a required file a delivery lacked.

  // The base delivery first, then a SPEC.md stub, else 404.
  app.post<{ Params: { slug: string } }>(
    '/api/me/studio/games/:slug/sources/stage/restore',
    { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (notFoundIfDisabled(reply)) return;
      if (!options.gamesStore) {
        return reply.status(503).send({ error: 'the Code surface is not configured on this deployment' });
      }
      const resolved = await resolveForSlug(request, reply);
      if (!resolved) return;
      const { record, slug } = resolved;
      const gamesStore = options.gamesStore;

      if (isLiveAgentRound(record)) {
        return reply.status(409).send({ error: 'agent_round', message: 'an agent is actively building this round' });
      }
      const activeRecord = roundIsClosed(record) ? await openManualRound(store, record, slug) : record;

      const parsed = RestoreInputSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }
      const path = parsed.data.path;

      const version = await resolveVersion(store, activeRecord, slug);
      const delivered = version ? await gamesStore.getSourceFile(slug, version, path) : null;
      const content = delivered ?? (path === 'SPEC.md' ? buildSpecStub(record) : null);
      if (content === null) {
        return reply.status(404).send({
          error: 'no_source',
          message: `nothing to restore ${path} from — no delivery of this game contains it`,
        });
      }

      const roundGeneration =
        (await store.ensureRoundGeneration(activeRecord.issueNumber)) ?? activeRecord.roundGeneration ?? 1;
      try {
        const staged = await gamesStore.putStagedSourceFile({
          slug,
          issueNumber: activeRecord.issueNumber,
          roundGeneration,
          path,
          content,
          stagedBy: 'owner',
        });
        options.invalidateStatusCache?.(activeRecord.issueNumber);
        options.scheduleStagedPreview?.(activeRecord.issueNumber);
        return reply.send({
          accepted: true,
          path: staged.path,
          bytes: staged.bytes,
          from: delivered !== null ? ('delivery' as const) : ('stub' as const),
          ...(activeRecord.issueNumber !== record.issueNumber ? { roundOpened: activeRecord.issueNumber } : {}),
          staged: {
            totalBytes: staged.totalBytes,
            maxBytes: staged.maxBytes,
            maxFiles: staged.maxFiles,
            updatedAt: staged.updatedAt,
          },
        });
      } catch (error) {
        if (error instanceof InvalidUploadError) return reply.status(400).send({ error: error.message });
        throw error;
      }
    },
  );

  /**
   * POST /api/me/studio/games/:slug/sources/stage/rebuild (CE-13) — arms the
   * debounced staged-preview assembly. Studio auto-calls after autosave/discard.
   */
  app.post<{ Params: { slug: string } }>(
    '/api/me/studio/games/:slug/sources/stage/rebuild',
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (notFoundIfDisabled(reply)) return;
      if (!options.gamesStore) {
        return reply.status(503).send({ error: 'the Code surface is not configured on this deployment' });
      }
      const resolved = await resolveForSlug(request, reply);
      if (!resolved) return;
      const { record } = resolved;

      if (!options.scheduleStagedPreview) {
        return reply.status(503).send({ error: 'stage rebuilds are not configured on this deployment' });
      }
      options.scheduleStagedPreview(record.issueNumber);
      return reply.send({ scheduled: true });
    },
  );

  const TypecheckInputSchema = z.object({
    overlay: z
      .array(z.object({ path: z.string().trim().min(1).max(120), content: z.string().max(1_000_000) }))
      .max(MAX_UPLOAD_FILES)
      .optional(),
  });

  /**
   * POST /api/me/studio/games/:slug/sources/typecheck (CE-11) — the in-memory `tsc`
   * that already backs the delivery preflight and the NL edit lane, run over the
   * current sources plus staging plus an optional client-supplied overlay (so a draft
   * still mid-autosave can be checked without waiting for the debounce).
   */
  app.post<{ Params: { slug: string } }>(
    '/api/me/studio/games/:slug/sources/typecheck',
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (notFoundIfDisabled(reply)) return;
      if (!options.gamesStore) {
        return reply.status(503).send({ error: 'the Code surface is not configured on this deployment' });
      }
      const resolved = await resolveForSlug(request, reply);
      if (!resolved) return;
      const { record, slug } = resolved;
      const gamesStore = options.gamesStore;

      const parsed = TypecheckInputSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      const version = await resolveVersion(store, record, slug);
      const roundGeneration = record.roundGeneration ?? 1;
      const sources: Record<string, string> = {};

      if (version) {
        const manifest = await gamesStore.getManifest(slug, version);
        if (manifest) {
          const reads = await Promise.all(
            manifest.sourceFiles.map(async (path) => ({
              path,
              content: await gamesStore.getSourceFile(slug, version, path),
            })),
          );
          for (const entry of reads) {
            if (entry.content !== null) sources[entry.path] = entry.content;
          }
        }
      }
      const staged = await gamesStore.getStagedSourceFiles({ slug, issueNumber: record.issueNumber, roundGeneration });
      for (const file of staged) {
        if (file.deleted) delete sources[file.path];
        else sources[file.path] = file.content;
      }
      for (const file of parsed.data.overlay ?? []) {
        sources[file.path] = file.content;
      }

      let kitDeclaration: string | null = null;
      if (kitFileStore) {
        try {
          const tree = await kitFileStore.loadTree();
          kitDeclaration = sharedSourcesFromKitTree(tree)['shared/game-kit.d.ts'] ?? null;
        } catch (error) {
          request.log.warn({ err: error, slug }, 'code surface typecheck: kit load failed, checking without it');
        }
      }

      const result = typeCheckGame(sources, kitDeclaration);
      return reply.send(result);
    },
  );

  // Track 2: builds staged sources, returns the document inline synchronously.
  app.post<{ Params: { slug: string } }>(
    '/api/me/studio/games/:slug/sources/preview',
    { config: { rateLimit: { max: 300, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (notFoundIfDisabled(reply)) return;
      if (!options.gamesStore || !options.githubClient) {
        return reply.status(503).send({ error: 'the Code surface is not configured on this deployment' });
      }
      const resolved = await resolveForSlug(request, reply);
      if (!resolved) return;
      const { record, slug } = resolved;
      const gamesStore = options.gamesStore;

      if (isLiveAgentRound(record)) {
        return reply.status(409).send({ error: 'agent_round', message: 'an agent is actively building this round' });
      }

      const roundGeneration = record.roundGeneration ?? 1;
      const staged = await gamesStore.getStagedSourceFiles({ slug, issueNumber: record.issueNumber, roundGeneration });
      const delivered = await readDeliveredSources({ gamesStore, store, record });
      const overlay = overlayGameSources({
        staged,
        delivered,
        ...(record.seed?.files ? { seed: record.seed.files } : {}),
      });
      if (!hasPlayableOverlay(overlay)) {
        return reply.status(409).send({ error: 'incomplete', message: 'not enough staged yet to build a preview' });
      }

      let engineRef: string | null = null;
      if (kitFileStore) {
        try {
          engineRef = (await kitFileStore.loadTree()).engineRef;
        } catch (error) {
          request.log.warn({ err: error, slug }, 'code surface preview: kit load failed');
        }
      }
      if (!engineRef) {
        return reply.status(503).send({ error: 'no kit published' });
      }

      try {
        const sources = await options.githubClient.getGameSources(engineRef, slug, overlay);
        if (!sources) {
          return reply.status(409).send({ error: 'incomplete', message: 'sources do not compile yet' });
        }
        const html = assembleGameHtml(
          {
            title: sources.title ?? slug,
            description: '',
            html: sources.indexHtml,
            js: sources.gameJs,
            css: sources.styleCss,
          },
          { restrictNetwork: true },
        );
        return reply.send({ html, engineRef, timings: sources.timings });
      } catch (error) {
        if (
          error instanceof EmptyProjectError ||
          error instanceof ProjectTooLargeError ||
          error instanceof CredentialLeakError
        ) {
          return reply.status(400).send({ error: error.message });
        }
        // esbuild throws on invalid TypeScript — not a server error.
        return reply.status(409).send({ error: 'incomplete', message: 'sources do not compile yet' });
      }
    },
  );

  // GA-01: feeds the browser language service, same kit resolution as typecheck.
  app.get<{ Params: { slug: string } }>(
    '/api/me/studio/games/:slug/sources/kit-declaration',
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (notFoundIfDisabled(reply)) return;
      const resolved = await resolveForSlug(request, reply);
      if (!resolved) return;
      if (!kitFileStore) {
        return reply.status(404).send({ error: 'no kit published' });
      }
      try {
        const tree = await kitFileStore.loadTree();
        const declaration = sharedSourcesFromKitTree(tree)['shared/game-kit.d.ts'] ?? null;
        if (declaration === null) {
          return reply.status(404).send({ error: 'no kit published' });
        }
        reply.header('etag', `"${tree.engineRef}"`);
        return reply.send({ engineRef: tree.engineRef, declaration });
      } catch (error) {
        request.log.warn({ err: error, slug: resolved.slug }, 'code surface: kit declaration load failed');
        return reply.status(404).send({ error: 'no kit published' });
      }
    },
  );

  const CompleteInputSchema = z.object({
    path: z.string().trim().min(1).max(120),
    prefixWindow: z.string().max(MAX_PREFIX_CHARS),
    suffixWindow: z.string().max(MAX_SUFFIX_CHARS),
  });

  // TA-01: ghost-text proposal, off by default unlike every route above.
  app.post<{ Params: { slug: string } }>(
    '/api/me/studio/games/:slug/sources/complete',
    { config: { rateLimit: { max: 600, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (notFoundIfDisabled(reply)) return;
      if (!options.tabCompleter || !tabCompleteEnabled()) {
        return reply.status(404).send({ error: 'not found' });
      }
      const resolved = await resolveForSlug(request, reply);
      if (!resolved) return;

      const parsed = CompleteInputSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      const nowMs = (options.now ?? Date.now)();
      const dateStr = new Date(nowMs).toISOString().slice(0, 10);
      const uid = request.user!.uid;

      // Global refusal first — must not spend a creator's own daily slot.
      let reserved = false;
      if (options.tabCompleteGate) {
        const gate = await options.tabCompleteGate.peek(uid, dateStr);
        if (!gate.allowed) {
          return reply.status(503).send({ error: 'completions are resting right now — try again later' });
        }
        reserved = gate.reserved;
      }

      const quota = await store.checkAndIncrementQuota(
        uid,
        dateStr,
        options.dailyTabCompleteQuota ??
          Number(process.env.DAILY_TAB_COMPLETE_QUOTA ?? DEFAULT_DAILY_TAB_COMPLETE_QUOTA),
        'tabCompletes',
      );
      if (!quota.allowed) {
        // The peek above may reserve a slot — free it on refusal.
        await options.tabCompleteGate?.spend(uid, dateStr, 0, reserved);
        return reply.status(429).send({ error: 'daily tab-complete quota exceeded' });
      }

      let result;
      try {
        result = await options.tabCompleter.complete({
          path: parsed.data.path,
          prefixWindow: parsed.data.prefixWindow,
          suffixWindow: parsed.data.suffixWindow,
        });
      } catch (error) {
        request.log.warn({ slug: resolved.slug, err: error }, 'tab-complete call failed');
        await options.tabCompleteGate?.spend(uid, dateStr, 0, reserved);
        return reply.status(503).send({ error: 'no completion right now — try again' });
      }

      const tokens = result.tokens;
      await options.tabCompleteGate?.spend(uid, dateStr, tokens ? tokens.input + tokens.output : 0, reserved);
      if (tokens) {
        await store
          .recordJobCost(resolved.record.issueNumber, {
            kind: 'tab_complete',
            at: new Date(nowMs).toISOString(),
            by: result.model ?? 'vertex',
            tokens,
          })
          .catch(() => {});
      }

      return reply.send({ completion: result.completion });
    },
  );

  const DeliverInputSchema = z.object({
    mode: z.enum(['preview', 'publish']),
    /**
     * CE-18's IP attestation: recorded on every delivery. Studio treats the
     * Publish click itself as the confirmation (no separate checkbox).
     */
    attestation: z.literal(true),
    summary: z.string().trim().max(1024).optional(),
  });

  /**
   * POST /api/me/studio/games/:slug/sources/deliver (CE-18) — the manual round's
   * delivery, through the same `createSourceDeliveryService` the agent channel uses:
   * same allowlist, same typecheck preflight, same rate limits. Requires an *active*
   * round — a slug whose newest round has already published or otherwise closed needs
   * a new round opened from the thread first (CE-17's round-open-on-first-write is not
   * implemented by this route; see the execution plan's own note that this is the
   * scoped-down half of Wave D).
   */
  app.post<{ Params: { slug: string } }>(
    '/api/me/studio/games/:slug/sources/deliver',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (notFoundIfDisabled(reply)) return;
      if (!options.gamesStore || !sourceDelivery) {
        return reply.status(503).send({ error: 'delivery is not configured on this deployment' });
      }
      const resolved = await resolveForSlug(request, reply);
      if (!resolved) return;
      const { record, slug } = resolved;
      const gamesStore = options.gamesStore;

      if (isLiveAgentRound(record)) {
        return reply.status(409).send({ error: 'agent_round', message: 'an agent is actively building this round' });
      }
      // Same "unset means queued" reading `nativeJobStatus` uses — a job that has
      // never transitioned (the common case for one nobody has touched since
      // creation) is not the same thing as a closed one.
      const resolvedState = resolveJobState(record) ?? 'queued';
      if (!isActiveBuildRound({ state: resolvedState, transitions: record.transitions })) {
        return reply.status(409).send({
          error: 'no_active_round',
          message: 'this game has no round open to deliver into — start a new round from the thread first',
        });
      }

      const parsed = DeliverInputSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      const lastAt = lastDeliverAt.get(slug);
      const nowMs = Date.now();
      if (lastAt !== undefined && nowMs - lastAt < DELIVER_COOLDOWN_MS) {
        return reply.status(429).send({
          error: 'deliver_cooldown',
          retryAfterMs: DELIVER_COOLDOWN_MS - (nowMs - lastAt),
        });
      }

      const roundGeneration = record.roundGeneration ?? 1;
      const version = await resolveVersion(store, record, slug);
      const baseFiles = new Map<string, string>();
      const baseManifest = version ? await gamesStore.getManifest(slug, version) : null;
      if (baseManifest) {
        const reads = await Promise.all(
          baseManifest.sourceFiles.map(async (path) => ({
            path,
            content: await gamesStore.getSourceFile(slug, version!, path),
          })),
        );
        for (const entry of reads) {
          if (entry.content !== null) baseFiles.set(entry.path, entry.content);
        }
      }
      const staged = await gamesStore.getStagedSourceFiles({ slug, issueNumber: record.issueNumber, roundGeneration });
      const stagedEntries = await gamesStore.listStagedSources({
        slug,
        issueNumber: record.issueNumber,
        roundGeneration,
      });
      for (const entry of staged) {
        if (entry.deleted) baseFiles.delete(entry.path);
        else baseFiles.set(entry.path, entry.content);
      }
      const files: SourceFile[] = [...baseFiles.entries()].map(([path, content]) => ({ path, content }));
      if (files.length === 0) {
        return reply.status(400).send({ error: 'nothing to deliver — stage at least one file first' });
      }

      // CE-20: authorship from the staged set's own stamps. A file the buffer never
      // touched (unchanged since the last delivery) says nothing about who wrote
      // *this* delivery, so only staged entries vote. An empty buffer re-delivers the
      // base version byte-for-byte — that content's authorship is whoever wrote *it*
      // (the base manifest's own stamp), not a default of 'owner' just because this
      // click happened to come from the owner-only Code surface route.
      const stagedByValues = new Set(
        stagedEntries.files.map((entry) => (entry.agentAssisted ? 'agent' : (entry.stagedBy ?? 'agent'))),
      );
      const authorship: 'agent' | 'owner' | 'mixed' =
        stagedByValues.size === 0
          ? (baseManifest?.authorship ?? 'owner')
          : stagedByValues.size > 1
            ? 'mixed'
            : [...stagedByValues][0]!;

      // Pin the delivery to the kit window's current head, same convention as an
      // agent's own get_kit-pinned round — a manual round never calls get_kit.
      let kitEngineRef: string | undefined;
      if (options.objectStore) {
        try {
          const registryBody = await options.objectStore.readObject('kits/current.json');
          if (registryBody) {
            const currentRef = parseKitRegistry(registryBody.toString('utf8')).current;
            kitEngineRef = (await store.pinRoundKitEngineRef(record.issueNumber, currentRef)) ?? currentRef;
          }
        } catch (error) {
          request.log.warn({ err: error, slug }, 'code surface deliver: could not pin the kit engine ref');
        }
      }

      request.log.info?.(
        { issueNumber: record.issueNumber, slug, uid: request.user!.uid, attestedAt: new Date(nowMs).toISOString() },
        'code surface: IP attestation recorded for manual delivery',
      );

      try {
        const outcome = await sourceDelivery.deliver({
          issueNumber: record.issueNumber,
          slug,
          files,
          mode: parsed.data.mode,
          ...(kitEngineRef ? { kitEngineRef } : {}),
          ...(parsed.data.summary ? { summary: parsed.data.summary } : {}),
          authorship,
          actor: 'creator',
        });
        if (outcome.accepted) {
          lastDeliverAt.set(slug, nowMs);
          // Publish consumes the buffer, like agent fromStaged submit.
          await gamesStore
            .clearStagedSources({ slug, issueNumber: record.issueNumber, roundGeneration })
            .catch((error: unknown) => {
              request.log.warn(
                { err: error, issueNumber: record.issueNumber, slug },
                'code surface deliver: could not clear working copy after publish',
              );
            });
        }
        options.invalidateStatusCache?.(record.issueNumber);
        return reply.send(outcome);
      } catch (error) {
        if (error instanceof SourceDeliveryValidationError || error instanceof InvalidUploadError) {
          // `error` stays the sentence; `code`/`missing` drive the fixit.
          const missing = error instanceof InvalidUploadError ? error.missingPaths : undefined;
          return reply.status(400).send({
            error: error.message,
            code: 'invalid_upload',
            ...(missing?.length ? { missing: [...missing] } : {}),
          });
        }
        throw error;
      }
    },
  );

  const RevertInputSchema = z.object({
    targetVersion: z.string().trim().min(1).max(64),
    mode: z.enum(['preview', 'publish']).default('preview'),
    attestation: z.literal(true),
  });

  // POST /api/me/studio/games/:slug/sources/revert — roll-forward revert.
  app.post<{ Params: { slug: string } }>(
    '/api/me/studio/games/:slug/sources/revert',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (notFoundIfDisabled(reply)) return;
      if (!options.gamesStore || !sourceDelivery) {
        return reply.status(503).send({ error: 'delivery is not configured on this deployment' });
      }
      const resolved = await resolveForSlug(request, reply);
      if (!resolved) return;
      const { record, slug } = resolved;
      const gamesStore = options.gamesStore;

      if (isLiveAgentRound(record)) {
        return reply.status(409).send({ error: 'agent_round', message: 'an agent is actively building this round' });
      }

      const parsed = RevertInputSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      const { targetVersion, mode } = parsed.data;
      const targetManifest = await gamesStore.getManifest(slug, targetVersion);
      if (!targetManifest) {
        return reply.status(404).send({ error: `target version ${targetVersion} not found` });
      }

      const reads = await Promise.all(
        targetManifest.sourceFiles.map(async (path) => ({
          path,
          content: await gamesStore.getSourceFile(slug, targetVersion, path),
        })),
      );

      const files: SourceFile[] = [];
      for (const entry of reads) {
        if (entry.content === null) {
          return reply
            .status(500)
            .send({ error: `failed to read source file ${entry.path} from version ${targetVersion}` });
        }
        files.push({ path: entry.path, content: entry.content });
      }

      if (files.length === 0) {
        return reply.status(400).send({ error: `target version ${targetVersion} contains no source files` });
      }

      const activeRecord = roundIsClosed(record) ? await openManualRound(store, record, slug) : record;

      let kitEngineRef: string | undefined = targetManifest.kitEngineRef;
      if (options.objectStore) {
        try {
          const registryBody = await options.objectStore.readObject('kits/current.json');
          if (registryBody) {
            const currentRef = parseKitRegistry(registryBody.toString('utf8')).current;
            kitEngineRef = (await store.pinRoundKitEngineRef(activeRecord.issueNumber, currentRef)) ?? currentRef;
          }
        } catch (error) {
          request.log.warn({ err: error, slug }, 'code surface revert: could not pin current kit engine ref');
        }
      }

      const nowMs = Date.now();
      request.log.info?.(
        {
          issueNumber: activeRecord.issueNumber,
          slug,
          targetVersion,
          uid: request.user!.uid,
          revertedAt: new Date(nowMs).toISOString(),
        },
        'code surface: revert roll-forward requested',
      );

      try {
        const roundGeneration = activeRecord.roundGeneration ?? 1;
        const outcome = await sourceDelivery.deliver({
          issueNumber: activeRecord.issueNumber,
          slug,
          files,
          mode,
          ...(kitEngineRef ? { kitEngineRef } : {}),
          authorship: 'owner',
          summary: `Reverted to build ${targetVersion}`,
          actor: 'creator',
        });
        if (outcome.accepted) {
          lastDeliverAt.set(slug, nowMs);
          await gamesStore
            .clearStagedSources({ slug, issueNumber: activeRecord.issueNumber, roundGeneration })
            .catch(() => {});
        }
        options.invalidateStatusCache?.(activeRecord.issueNumber);
        const token = options.mintStatusToken?.(activeRecord.issueNumber);
        return reply.send({
          ...outcome,
          targetVersion,
          ...(activeRecord.issueNumber !== record.issueNumber ? { roundOpened: activeRecord.issueNumber } : {}),
          ...(token ? { token } : {}),
        });
      } catch (error) {
        if (error instanceof SourceDeliveryValidationError || error instanceof InvalidUploadError) {
          const missing = error instanceof InvalidUploadError ? error.missingPaths : undefined;
          return reply.status(400).send({
            error: error.message,
            code: 'invalid_upload',
            ...(missing?.length ? { missing: [...missing] } : {}),
          });
        }
        throw error;
      }
    },
  );
}
