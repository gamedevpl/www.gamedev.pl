import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  EDITOR_FILE,
  GENERATED_CONTENT_PATH,
  generateEditorContentModule,
  parseEditorDefinition,
  validateEditorContent,
  type EditorDefinition,
} from './editor-contract.js';
import type { GamesStore } from './games-store.js';
import { MAX_EDITOR_DRAFT_BYTES, type Store, type SubmissionRecord } from './store.js';
import type { ContentChecker } from './moderation.js';
import { logModerationRejection } from './moderation-metrics.js';

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
 * A game is editable iff its delivered version ships an EDITOR.json. Games
 * without one (the entire existing catalog) never reach these routes with
 * anything but 404 — being editable is opt-in per game, decided by the agent
 * run that built it.
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

export interface EditorRoutesOptions {
  store: Store;
  gamesStore?: GamesStore;
  contentChecker?: ContentChecker;
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
  ): Promise<{ submission: SubmissionRecord; version: string; definition: EditorDefinition } | null> {
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
    const version = submission.deliveredVersion;
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
      // The gate validated this file before the version could be delivered, so a
      // parse failure here means contract drift between the repos — a platform
      // bug, and 500 is the honest status for it.
      request.log.error({ slug: params.data.slug, version, errors }, 'stored EDITOR.json failed to parse');
      reply.status(500).send({ error: 'the editor definition could not be read' });
      return null;
    }
    return { submission, version, definition };
  }

  /** The definition's own defaults, shaped as a content document. */
  function defaultContent(definition: EditorDefinition): Record<string, unknown> {
    return Object.fromEntries(Object.entries(definition.content).map(([key, spec]) => [key, spec.defaults]));
  }

  /** Every declared-text value in a content document, for moderation. */
  function textFields(definition: EditorDefinition, content: Record<string, unknown>): string[] {
    const texts: string[] = [];
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
      content: defaultContent(resolved.definition),
      draft: draft && draftContent ? { content: draftContent, revision: draft.revision, updatedAt: draft.updatedAt } : null,
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
        return reply.status(422).send({ error: 'draft does not fit this game\'s content schema', problems: problems.slice(0, 20) });
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
      const existing = await store.getEditorDraft(request.user!.uid, slug);
      if (
        body.data.baseRevision !== undefined &&
        existing &&
        existing.revision !== body.data.baseRevision
      ) {
        // Another device wrote since this tab loaded. Last-write-wins is the
        // policy, but it must be the *caller's* decision — resend without a
        // baseRevision to take over deliberately.
        return reply.status(409).send({ error: 'draft changed elsewhere', revision: existing.revision });
      }
      const record = await store.putEditorDraft(request.user!.uid, slug, serialized, (existing?.revision ?? 0) + 1);
      return reply.send({ ok: true, revision: record.revision, updatedAt: record.updatedAt });
    },
  );

  app.delete('/api/me/games/:slug/editor/draft', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const resolved = await resolveEditable(request, reply);
    if (!resolved) return;
    await store.deleteEditorDraft(request.user!.uid, resolved.submission.slug as string);
    return reply.send({ ok: true });
  });

  app.post(
    '/api/me/games/:slug/editor/publish',
    { config: { rateLimit: { max: 6, timeWindow: 60 * 60_000 } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return;
      const resolved = await resolveEditable(request, reply);
      if (!resolved) return;
      const slug = resolved.submission.slug as string;

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
          .send({ error: 'the draft no longer fits this game\'s content schema', problems: problems.slice(0, 20) });
      }

      const last = lastPublishAt.get(slug) ?? 0;
      const wait = last + PUBLISH_COOLDOWN_MS - now();
      if (wait > 0) {
        // A publish is a real gate run (Cloud Build, Chrome, ffmpeg). The
        // cooldown is debounce, not a quota — drafts stay unmetered.
        reply.header('retry-after', String(Math.ceil(wait / 1000)));
        return reply.status(429).send({ error: 'a publish is already checking — try again shortly', retryAfterMs: wait });
      }

      const gamesStore = options.gamesStore!;
      const previous = await gamesStore.getManifest(slug, resolved.version);
      if (!previous) {
        return reply.status(409).send({ error: 'the delivered version could not be read' });
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
      const raw = JSON.parse(editorFile.content) as { content: Record<string, { defaults?: unknown }> };
      for (const [key, spec] of Object.entries(raw.content)) {
        if (content[key] !== undefined) spec.defaults = content[key];
      }
      editorFile.content = `${JSON.stringify(raw, null, 2)}\n`;

      const reparsed = parseEditorDefinition(editorFile.content);
      if (!reparsed.definition) {
        return reply
          .status(422)
          .send({ error: 'the draft does not produce a valid editor definition', problems: reparsed.errors.slice(0, 20) });
      }
      const generatedPath = GENERATED_CONTENT_PATH;
      const generated = files.find((file) => file.path === generatedPath);
      const generatedContent = generateEditorContentModule(reparsed.definition);
      if (generated) generated.content = generatedContent;
      else files.push({ path: generatedPath, content: generatedContent });

      lastPublishAt.set(slug, now());
      const { version } = await gamesStore.putCandidateSources({
        slug,
        issueNumber: resolved.submission.issueNumber,
        files,
        backend: 'editor',
        origin: 'editor',
        // Pin the engine the previous version was accepted against: a content
        // edit should be judged on the engine its game is known to work on.
        ...(previous.engineRef ? { engineRef: previous.engineRef } : {}),
      });
      await store.setSubmissionDeliveredVersion(resolved.submission.issueNumber, version);

      const gate = await options.onSourcesDelivered?.({
        issueNumber: resolved.submission.issueNumber,
        slug,
        version,
      });
      if (gate?.buildId) {
        await store
          .recordJobCost(resolved.submission.issueNumber, {
            kind: 'gate_run',
            at: new Date().toISOString(),
            by: 'cloud-build',
            ref: gate.buildId,
          })
          .catch(() => {});
      }

      return reply.send({ ok: true, version });
    },
  );
}
