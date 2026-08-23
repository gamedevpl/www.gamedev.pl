import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  EDITOR_CONTENT_FILE,
  EDITOR_FILE,
  GENERATED_CONTENT_PATH,
  LAYERS_KEY,
  PARAMS_KEY,
  generateEditorContentModule,
  parseEditorDefinition,
  validateEditorContent,
  type EditorContentDocument,
  type EditorDefinition,
} from './editor-contract.js';
import { editorKitV2Enabled } from './agent-surface/editor-kit-env.js';
import { isLiveAgentRound } from './code-surface.js';
import type { GamesStore } from './delivery/games-store.js';
import { MAX_EDITOR_DRAFT_BYTES, type Store, type SubmissionRecord } from './platform/store.js';
import type { ContentChecker } from './platform/moderation.js';
import { logModerationRejection } from './telemetry/moderation-metrics.js';
import { MAX_UTTERANCE_LENGTH, applyAssistPatches, assistEnabled, type EditorAssistant } from './editor-assist.js';
import type { EditingGate } from './creation-limits.js';

/**
 * The Creator Studio content editor's API (EditorKit L3/L4 — the platform half
 * of "the editor ships with the game", docs: the ops repo's game-tooling
 * research §3).
 *
 * Two tiers, matching the two costs:
 *
 *  - **Drafts** live in Firestore under the creator (`users/{uid}/editorDrafts`),
 *    debounce-friendly and free: every write is validated against the game's own
 *    EDITOR.json declaration (the L4 validator — same code the games repo's
 *    Check 31 runs) plus moderation on declared text, but no Cloud Build is ever
 *    involved. A draft is private until published.
 *  - **Publish** promotes the draft into a content-only candidate version in the
 *    games store — the previous version's sources with new EDITOR.json defaults
 *    and a regenerated `game/editor-content.ts` — and the full gate runs on it
 *    exactly as it does on an agent delivery. Promotion to live stays the
 *    existing operator step; nothing here publishes to players.
 *
 * A game is editable iff its latest build — preview mid-round, or delivered —
 * ships an EDITOR.json. Games without one (the entire existing catalog) never
 * reach these routes with anything but 404 — opt-in per game, decided by the
 * agent run that built it.
 */

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const ParamsSchema = z.object({
  slug: z.string().min(1).max(80).regex(SLUG_PATTERN, 'not a valid game id'),
});

const DraftSchema = z.object({
  /** The full content document ({ collection: items[] }); always a whole snapshot. */
  content: z.record(z.string(), z.unknown()),
  /**
   * The revision this write was based on. A mismatch means another device wrote
   * in between; the caller gets a 409 with the current revision and decides.
   */
  baseRevision: z.number().int().min(0).optional(),
});

/** Publishes are a real gate run each — debounce, not quota (research doc §7). */
export const PUBLISH_COOLDOWN_MS = 10 * 60_000;

const AssistSchema = z.object({
  utterance: z.string().trim().min(2).max(MAX_UTTERANCE_LENGTH),
  /** The document the creator is looking at, so relative requests move live values. */
  content: z.record(z.string(), z.unknown()),
});

/**
 * Each assist is one paid Vertex call. Bounded per creator per day for the same
 * reason refines are: the ceiling should be a decision, not the invite count.
 */
export const DEFAULT_DAILY_ASSIST_QUOTA = 60;

export interface EditorRoutesOptions {
  store: Store;
  gamesStore?: GamesStore;
  contentChecker?: ContentChecker;
  /** The natural-language tuning router. Absent (or flag off) → the route 503s. */
  assistant?: EditorAssistant;
  /** The platform-wide editing spend breaker. Absent → per-user limits only. */
  editingGate?: EditingGate;
  dailyAssistQuota?: number;
  /** Same seam the delivery route uses — starts the gate on a new candidate. */
  onSourcesDelivered?: (input: {
    issueNumber: number;
    slug: string;
    version: string;
  }) => Promise<{ buildId?: string } | void> | void;
  now?: () => number;
}

export async function registerEditorRoutes(app: FastifyInstance, options: EditorRoutesOptions): Promise<void> {
  const { store } = options;
  const now = options.now ?? Date.now;
  /**
   * Per-instance cooldown marks. Deliberately in memory: the worst a restart can
   * cost is one extra gate run, while a Firestore field would need cleanup and a
   * transaction for something that is UX pacing, not a security boundary.
   */
  const lastPublishAt = new Map<string, number>();

  function requireUser(request: FastifyRequest, reply: FastifyReply): boolean {
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

  /**
   * Resolve a slug to (owned submission, delivered version, parsed definition).
   * Replies and returns null when the game is not the caller's or not editable.
   * 404 rather than 403 throughout, like the suggestion routes: a slug is
   * public, and confirming one exists but belongs to somebody else says more
   * than it needs to.
   */
  async function resolveEditable(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{
    submission: SubmissionRecord;
    version: string;
    definition: EditorDefinition;
    content: Record<string, unknown>;
  } | null> {
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) {
      reply.status(400).send({ error: params.error.issues[0]?.message ?? 'invalid slug' });
      return null;
    }
    if (!options.gamesStore) {
      reply.status(503).send({ error: 'editing is not configured on this deployment' });
      return null;
    }
    const submission = await store.getSubmissionBySlug(params.data.slug);
    if (!submission || submission.ownerUid !== request.user!.uid) {
      reply.status(404).send({ error: 'not found' });
      return null;
    }
    // previewVersion first — same order as get_sources; it is always the newest.
    const version = submission.previewVersion ?? submission.deliveredVersion;
    if (!version) {
      reply.status(404).send({ error: 'this game has no editable content' });
      return null;
    }
    const editorJson = await options.gamesStore.getSourceFile(params.data.slug, version, EDITOR_FILE);
    if (!editorJson) {
      reply.status(404).send({ error: 'this game has no editable content' });
      return null;
    }
    const { definition, errors } = parseEditorDefinition(editorJson);
    if (!definition) {
      if (version === submission.deliveredVersion) {
        // The gate validated this file before the version could be delivered, so a
        // parse failure here means contract drift between the repos — a platform
        // bug, and 500 is the honest status for it.
        request.log.error({ slug: params.data.slug, version, errors }, 'stored EDITOR.json failed to parse');
        reply.status(500).send({ error: 'the editor definition could not be read' });
        return null;
      }
      // A preview build is never gate-validated first — this is mid-iteration, not a bug.
      reply.status(404).send({ error: 'this game has no editable content' });
      return null;
    }
    if (definition.version === 2 && !editorKitV2Enabled()) {
      reply.status(404).send({ error: 'this editor version is not enabled' });
      return null;
    }
    let content: Record<string, unknown>;
    if (definition.version === 2) {
      const contentJson = await options.gamesStore.getSourceFile(params.data.slug, version, EDITOR_CONTENT_FILE);
      if (!contentJson) {
        reply.status(404).send({ error: 'this game has no editable content' });
        return null;
      }
      try {
        content = JSON.parse(contentJson) as Record<string, unknown>;
      } catch {
        reply.status(500).send({ error: 'the editor content could not be read' });
        return null;
      }
      const problems = validateEditorContent(definition, content);
      if (problems.length > 0) {
        reply.status(500).send({ error: 'the editor content could not be read' });
        return null;
      }
    } else {
      content = defaultContent(definition);
    }
    return { submission, version, definition, content };
  }

  /** The definition's own defaults, shaped as a content document. */
  function defaultContent(definition: EditorDefinition): Record<string, unknown> {
    const content: Record<string, unknown> = Object.fromEntries(
      Object.entries(definition.content).map(([key, spec]) => [key, spec.defaults]),
    );
    if (definition.params) {
      content[PARAMS_KEY] = Object.fromEntries(
        Object.entries(definition.params).map(([key, spec]) => [key, spec.default]),
      );
    }
    return content;
  }

  /** Every declared-text value in a content document, for moderation. */
  function textFields(definition: EditorDefinition, content: Record<string, unknown>): string[] {
    const texts: string[] = [];
    if (definition.params) {
      const values = content[PARAMS_KEY];
      for (const [name, spec] of Object.entries(definition.params)) {
        if (spec.type !== 'text' || !values || typeof values !== 'object') continue;
        const value = (values as Record<string, unknown>)[name];
        if (typeof value === 'string' && value.trim().length > 0) texts.push(value);
      }
    }
    for (const [key, spec] of Object.entries(definition.content)) {
      const textProps = Object.entries(spec.item.properties)
        .filter(([, propertySpec]) => propertySpec.type === 'text')
        .map(([name]) => name);
      if (textProps.length === 0) continue;
      const items = content[key];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const properties = (item as { properties?: Record<string, unknown> }).properties;
        if (!properties) continue;
        for (const name of textProps) {
          const value = properties[name];
          if (typeof value === 'string' && value.trim().length > 0) texts.push(value);
        }
      }
    }
    const layerValues = content[LAYERS_KEY];
    if (definition.layers && layerValues && typeof layerValues === 'object' && !Array.isArray(layerValues)) {
      for (const [key, spec] of Object.entries(definition.layers)) {
        const textProps = Object.entries(spec.properties)
          .filter(([, propertySpec]) => propertySpec.type === 'text')
          .map(([name]) => name);
        if (textProps.length === 0) continue;
        const values = (layerValues as Record<string, unknown>)[key];
        const items = spec.widget === 'entities' && Array.isArray(values) ? values : [values];
        for (const item of items) {
          const properties = (item as { properties?: Record<string, unknown> } | null)?.properties;
          if (!properties) continue;
          for (const name of textProps) {
            const value = properties[name];
            if (typeof value === 'string' && value.trim().length > 0) texts.push(value);
          }
        }
      }
    }
    return texts;
  }

  app.get('/api/me/games/:slug/editor', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const resolved = await resolveEditable(request, reply);
    if (!resolved) return;
    const draft = await store.getEditorDraft(request.user!.uid, resolved.submission.slug as string);
    let draftContent: unknown = null;
    if (draft) {
      try {
        draftContent = JSON.parse(draft.content);
      } catch {
        draftContent = null;
      }
    }
    return reply.send({
      version: resolved.version,
      definition: resolved.definition,
      content: resolved.content,
      draft:
        draft && draftContent ? { content: draftContent, revision: draft.revision, updatedAt: draft.updatedAt } : null,
    });
  });

  app.put(
    '/api/me/games/:slug/editor/draft',
    { config: { rateLimit: { max: 60, timeWindow: 60_000 } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return;
      const resolved = await resolveEditable(request, reply);
      if (!resolved) return;
      const body = DraftSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'invalid request' });
      }

      const serialized = JSON.stringify(body.data.content);
      if (Buffer.byteLength(serialized, 'utf8') > MAX_EDITOR_DRAFT_BYTES) {
        return reply.status(413).send({ error: 'draft is too large' });
      }

      // The L4 validator — the same rules Check 31 enforces on delivery, so a
      // draft that saves is a draft that can eventually pass the gate.
      const problems = validateEditorContent(resolved.definition, body.data.content);
      if (problems.length > 0) {
        return reply
          .status(422)
          .send({ error: "draft does not fit this game's content schema", problems: problems.slice(0, 20) });
      }

      // Declared text is shown to players once published, so it is moderated at
      // the same point every other creator text is: on the write.
      const texts = textFields(resolved.definition, body.data.content);
      if (texts.length > 0 && options.contentChecker) {
        const verdict = await options.contentChecker.checkFields(texts);
        if (!verdict.allowed) {
          logModerationRejection(request.log, {
            surface: 'editor_draft',
            uid: request.user?.uid,
            category: verdict.category,
          });
          return reply.status(422).send({ error: 'that text was rejected', category: verdict.category ?? 'other' });
        }
      }

      const slug = resolved.submission.slug as string;
      // The compare and the increment happen inside one store transaction: doing
      // it here as read-then-write would let two tabs on the same base revision
      // both succeed, with one edit lost and both told they were saved.
      const written = await store.putEditorDraft(request.user!.uid, slug, serialized, body.data.baseRevision);
      if (written.conflict) {
        // Another device wrote since this tab loaded. Last-write-wins is the
        // policy, but it must be the *caller's* decision — resend without a
        // baseRevision to take over deliberately.
        return reply.status(409).send({ error: 'draft changed elsewhere', revision: written.revision });
      }
      return reply.send({ ok: true, revision: written.record.revision, updatedAt: written.record.updatedAt });
    },
  );

  app.delete('/api/me/games/:slug/editor/draft', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const resolved = await resolveEditable(request, reply);
    if (!resolved) return;
    await store.deleteEditorDraft(request.user!.uid, resolved.submission.slug as string);
    return reply.send({ ok: true });
  });

  /**
   * Natural language → a validated params patch.
   *
   * Deliberately *returns* a document instead of writing one: the creator's
   * draft is still saved by the ordinary `PUT …/draft` path, so validation,
   * moderation, revision conflicts and autosave behave identically whether a
   * value came from a slider or a sentence. This route's own guarantees are
   * narrower and mechanical — the model can only name declared params, values
   * are clamped into declared ranges, and a patch set that would not validate
   * is dropped whole.
   */
  app.post(
    '/api/me/games/:slug/editor/assist',
    { config: { rateLimit: { max: 20, timeWindow: 60_000 } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return;
      if (!options.assistant || !assistEnabled()) {
        return reply.status(503).send({ error: 'assist is not enabled on this deployment' });
      }
      const resolved = await resolveEditable(request, reply);
      if (!resolved) return;
      const body = AssistSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'invalid request' });
      }
      if (!resolved.definition.params) {
        return reply.status(409).send({ error: 'this game has no tunable settings' });
      }

      // Moderation first, before a paid call and before the text reaches a model
      // — same fail-closed posture as every other creator-text path.
      if (options.contentChecker) {
        const verdict = await options.contentChecker.check(body.data.utterance);
        if (!verdict.allowed) {
          logModerationRejection(request.log, {
            surface: 'editor_assist',
            uid: request.user?.uid,
            category: verdict.category,
          });
          return reply.status(422).send({ error: 'that request was rejected', category: verdict.category ?? 'other' });
        }
      }

      const dateStr = new Date(now()).toISOString().slice(0, 10);
      const quota = await store.checkAndIncrementQuota(
        request.user!.uid,
        dateStr,
        options.dailyAssistQuota ?? Number(process.env.DAILY_ASSIST_QUOTA ?? DEFAULT_DAILY_ASSIST_QUOTA),
        'assists',
      );
      if (!quota.allowed) {
        return reply.status(429).send({ error: 'daily tuning-assist quota exceeded' });
      }

      // The platform-wide breaker, after the per-user gates: a refusal here is
      // the whole product resting, not this creator misbehaving, and the copy
      // says so. Spends a slot only when the call is actually about to happen.
      if (options.editingGate) {
        const gate = await options.editingGate.checkAndSpend(request.user!.uid, dateStr);
        if (!gate.allowed) {
          return reply.status(503).send({ error: 'editing is resting right now — try again later' });
        }
      }

      const slug = resolved.submission.slug as string;
      let result;
      try {
        result = await options.assistant.assist({
          definition: resolved.definition,
          content: body.data.content,
          utterance: body.data.utterance,
          game: resolved.submission.title ? { title: resolved.submission.title } : {},
          ...(resolved.submission.locale ? { locale: resolved.submission.locale } : {}),
        });
      } catch (error) {
        // Never fail open into a *write*: with no answer there is nothing to
        // apply, so the honest reply is that the router did not answer.
        request.log.warn({ slug, err: error }, 'editor assist call failed');
        return reply.status(503).send({ error: 'the assistant did not answer — try again' });
      }

      // Cost lands on the game's own job, beside gate runs and seeds, so a
      // creator's tuning spend is visible in the same report as everything else.
      if (result.tokens) {
        await store
          .recordJobCost(resolved.submission.issueNumber, {
            kind: 'assist',
            at: new Date(now()).toISOString(),
            by: result.model ?? 'vertex',
            tokens: result.tokens,
          })
          .catch(() => {});
      }

      if (result.lane !== 'params' || !result.patches || result.patches.length === 0) {
        // Every non-acting lane returns the same shape, so the panel can say
        // what happened rather than showing a silent no-op.
        return reply.send({
          lane: result.lane === 'params' ? 'code' : result.lane,
          ...(result.summary ? { summary: result.summary } : {}),
        });
      }

      const applied = applyAssistPatches(resolved.definition, body.data.content, result.patches);
      if (applied.patches.length === 0) {
        return reply.send({ lane: 'code', ...(result.summary ? { summary: result.summary } : {}) });
      }
      request.log.info({ slug, lane: result.lane, patches: applied.patches.length }, 'editor assist applied');
      return reply.send({
        lane: 'params',
        patches: applied.patches,
        content: applied.content,
        ...(result.summary ? { summary: result.summary } : {}),
      });
    },
  );

  app.post(
    '/api/me/games/:slug/editor/publish',
    { config: { rateLimit: { max: 6, timeWindow: 60 * 60_000 } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return;
      const resolved = await resolveEditable(request, reply);
      if (!resolved) return;
      const slug = resolved.submission.slug as string;

      // Publish forks a new job (below) — while the agent still owns this round, its
      // own next delivery would lose "current version" to that fork. Drafting and
      // viewing stay open mid-round; only the job-forking write waits for it to stop.
      if (isLiveAgentRound(resolved.submission)) {
        return reply.status(409).send({
          error: 'agent_round',
          message: 'an agent is actively building this round — try again once it stops',
        });
      }

      const draft = await store.getEditorDraft(request.user!.uid, slug);
      if (!draft) {
        return reply.status(409).send({ error: 'nothing to publish — there is no draft' });
      }
      let content: Record<string, unknown>;
      try {
        content = JSON.parse(draft.content) as Record<string, unknown>;
      } catch {
        return reply.status(409).send({ error: 'the draft could not be read — save it again' });
      }

      // Validated again at the door even though the draft write validated it:
      // the definition may have moved under the draft (a newer agent delivery
      // changed the schema), and the gate is minutes of Cloud Build away.
      const problems = validateEditorContent(resolved.definition, content);
      if (problems.length > 0) {
        return reply
          .status(422)
          .send({ error: "the draft no longer fits this game's content schema", problems: problems.slice(0, 20) });
      }

      const last = lastPublishAt.get(slug) ?? 0;
      const wait = last + PUBLISH_COOLDOWN_MS - now();
      if (wait > 0) {
        // A publish is a real gate run (Cloud Build, Chrome, ffmpeg). The
        // cooldown is debounce, not a quota — drafts stay unmetered.
        reply.header('retry-after', String(Math.ceil(wait / 1000)));
        return reply
          .status(429)
          .send({ error: 'a publish is already checking — try again shortly', retryAfterMs: wait });
      }

      const gamesStore = options.gamesStore!;
      const previous = await gamesStore.getManifest(slug, resolved.version);
      if (!previous) {
        return reply.status(409).send({ error: 'the delivered version could not be read' });
      }
      // putCandidateSources below defaults to mode=publish, requiring both seals —
      // refuse cleanly here rather than let a preview's missing seal throw mid-copy.
      if (!previous.sourceFiles.includes('TRACE.json') || !previous.sourceFiles.includes('PLAYTEST.json')) {
        return reply.status(409).send({
          error: 'not_sealed',
          message: "this game's current build isn't sealed for publish yet — try again once the round delivers",
        });
      }

      // The new version = the previous sources, with the editor content swapped:
      // EDITOR.json's defaults become the draft, and the generated L1 module is
      // regenerated to match (the gate's Check 31 byte-compares exactly this).
      const files: Array<{ path: string; content: string }> = [];
      for (const path of previous.sourceFiles) {
        const body = await gamesStore.getSourceFile(slug, resolved.version, path);
        if (body === null) {
          return reply.status(409).send({ error: `the delivered version is missing ${path}` });
        }
        files.push({ path, content: body });
      }

      const editorFile = files.find((file) => file.path === EDITOR_FILE)!;
      const generatedPath = GENERATED_CONTENT_PATH;
      const generated = files.find((file) => file.path === generatedPath);
      if (resolved.definition.version === 2) {
        const contentFile = files.find((file) => file.path === EDITOR_CONTENT_FILE);
        if (!contentFile) {
          return reply.status(409).send({ error: `the delivered version is missing ${EDITOR_CONTENT_FILE}` });
        }
        contentFile.content = `${JSON.stringify(content, null, 2)}\n`;
        const generatedContent = generateEditorContentModule(resolved.definition, content as EditorContentDocument);
        if (generated) generated.content = generatedContent;
        else files.push({ path: generatedPath, content: generatedContent });
      } else {
        const raw = JSON.parse(editorFile.content) as {
          params?: Record<string, { default?: unknown }>;
          content?: Record<string, { defaults?: unknown }>;
        };
        for (const [key, spec] of Object.entries(raw.content ?? {})) {
          if (content[key] !== undefined) spec.defaults = content[key];
        }
        const paramValues = content[PARAMS_KEY];
        if (raw.params && paramValues && typeof paramValues === 'object') {
          for (const [key, spec] of Object.entries(raw.params)) {
            const value = (paramValues as Record<string, unknown>)[key];
            if (value !== undefined) spec.default = value;
          }
        }
        editorFile.content = `${JSON.stringify(raw, null, 2)}\n`;

        const reparsed = parseEditorDefinition(editorFile.content);
        if (!reparsed.definition) {
          return reply.status(422).send({
            error: 'the draft does not produce a valid editor definition',
            problems: reparsed.errors.slice(0, 20),
          });
        }
        const generatedContent = generateEditorContentModule(reparsed.definition);
        if (generated) generated.content = generatedContent;
        else files.push({ path: generatedPath, content: generatedContent });
      }

      // A content edit gets its own job, exactly as a post-publish improvement
      // does (`startImprovementRound`), and for the same reason: `published` is a
      // terminal state, so hanging a new candidate off the original job would
      // leave its gate verdict somewhere nothing reads. `reconcileGateVerdict`
      // only walks `submitted`/`gating` records and the operator queue hides
      // terminal ones, so the edit would have been gated and then silently
      // stranded — green, unpublishable, and invisible to the person who
      // approves it. The difference from an improvement is only that no agent is
      // dispatched: the sources exist already, so the job walks straight to
      // `submitted`.
      const source = resolved.submission;
      const jobId = await store.allocateJobId();
      await store.createSubmission(jobId, source.ownerUid, source.title);
      if (source.locale) await store.setSubmissionLocale(jobId, source.locale);
      await store.setSubmissionSlug(jobId, slug);
      const at = () => new Date(now()).toISOString();
      await store.recordJobTransition(jobId, { to: 'queued', at: at(), by: 'creator', reason: 'content_edit' });
      await store.recordJobTransition(jobId, { to: 'building', at: at(), by: 'creator', reason: 'content_edit' });

      let version: string;
      try {
        ({ version } = await gamesStore.putCandidateSources({
          slug,
          issueNumber: jobId,
          files,
          backend: 'editor',
          origin: 'editor',
          // Pin the engine the previous version was accepted against: a content
          // edit should be judged on the engine its game is known to work on.
          ...(previous.engineRef ? { engineRef: previous.engineRef } : {}),
        }));
      } catch (error) {
        // Nothing was stored, so nothing should be debounced: leaving the
        // cooldown set here would strand the creator for ten minutes over a
        // transient failure they cannot see or retry past.
        await store
          .recordJobTransition(jobId, { to: 'failed', at: at(), by: 'creator', reason: 'delivery_failed' })
          .catch(() => {});
        throw error;
      }
      // Recorded only once the candidate is really in the store — the publish has
      // happened at this point, and every write below is bookkeeping.
      lastPublishAt.set(slug, now());
      await store.setSubmissionDeliveredVersion(jobId, version);
      await store.recordJobTransition(jobId, { to: 'submitted', at: at(), by: 'creator', reason: 'content_delivered' });

      const gate = await options.onSourcesDelivered?.({ issueNumber: jobId, slug, version });
      if (gate?.buildId) {
        await store
          .recordJobCost(jobId, {
            kind: 'gate_run',
            at: new Date().toISOString(),
            by: 'cloud-build',
            ref: gate.buildId,
          })
          .catch(() => {});
      }

      return reply.send({ ok: true, version, jobId });
    },
  );
}
