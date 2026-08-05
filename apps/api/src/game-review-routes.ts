import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { GamesStore, VersionManifest } from './games-store.js';
import { summarizeSourceDiff, type SourceDiffSummary } from './source-diff.js';
import type { Store, SubmissionRecord } from './store.js';

/**
 * The review surface — "Do zagrania".
 *
 * A change to a game is judged by **playing it**, not by reading a diff: two playable
 * frames side by side, what is live and what was just built, thirty seconds each. This
 * serves the halves of that comparison, plus the gate's verdict and a line-count
 * footnote (ops `docs/game-page-plan.md`).
 *
 * Two boundaries this route does not cross:
 *
 *  - **It never publishes.** Publishing is an operator action by design
 *    (job-admin-routes.ts): the gate answers "does this run", a human answers "may this
 *    be on the site", and the second is the moderation boundary the DSA and the AI Act
 *    care about. What the creator can record here is a *sign-off* — they asked for the
 *    change, they played it, they accept it — which an operator sees when publishing.
 *  - **It never serves a candidate to the public.** A delivered version is unreviewed
 *    output. Only the game's owner and an operator can see it, and only ever as the
 *    gate-built bundle inside the same sandbox every other game runs in.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Version ids are minted by the store (`v<compacted ISO>-<hex>`); never free text. */
const VERSION_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const SlugParamsSchema = z.object({ slug: z.string().trim().min(1).max(64) });
const VersionParamsSchema = SlugParamsSchema.extend({ version: z.string().trim().min(1).max(64) });

export interface ReviewCandidate {
  version: string;
  createdAt: string;
  jobId: number;
  title: string;
  /** Gate verdict for this candidate. A red one can be looked at but never signed off. */
  gate: { green: boolean; ranAt: string; report?: string } | null;
  /** Present once the creator has played it and accepted it. */
  approvedAt?: string;
}

export interface GameReviewResponse {
  /** The version currently live — the left-hand frame. Null before a first publish. */
  baselineVersion: string | null;
  candidate: ReviewCandidate | null;
  /** Line counts between baseline and candidate. Null when there is nothing to compare. */
  diff: SourceDiffSummary | null;
  /** True for an operator viewing somebody else's game. */
  viewerIsOperator: boolean;
  /**
   * Whether this viewer may record the sign-off. Owners can; operators looking at
   * somebody else's game cannot, because the sign-off speaks for the creator.
   */
  canSignOff: boolean;
}

export interface GameReviewRoutesOptions {
  store: Store;
  gamesStore?: GamesStore | null;
  adminUids?: Set<string>;
  now?: () => number;
}

export async function registerGameReviewRoutes(app: FastifyInstance, options: GameReviewRoutesOptions): Promise<void> {
  const { store, gamesStore } = options;
  const adminUids = options.adminUids ?? new Set<string>();
  const now = options.now ?? Date.now;

  /**
   * Resolves who is asking, or answers for us.
   *
   * 404 rather than 403 for a stranger, like the suggestion and editor-draft routes: a
   * slug is public, and "exists but is not yours" says more than it needs to.
   */
  async function authorize(
    request: { user?: { uid: string } | null },
    reply: { status: (code: number) => { send: (body: unknown) => unknown } },
    slug: string,
  ): Promise<{ uid: string; isOperator: boolean; isOwner: boolean; published: SubmissionRecord | null } | null> {
    const uid = request.user?.uid;
    if (!uid) {
      reply.status(401).send({ error: 'authentication required' });
      return null;
    }
    const published = await store.getPublishedSubmissionBySlug(slug);
    const isOperator = adminUids.has(uid);

    // Ownership is asked of every job on the slug, not only the published one: the
    // candidate under review belongs to an improvement job, and on a game that has
    // never published there is no published record to ask at all.
    //
    // Asked of operators too, rather than short-circuiting on the admin list: an
    // operator may *look* at any game, but the sign-off below means "the person who
    // asked for this change played it and accepts it", and only the owner can say
    // that. An operator who happens to own the game is still its owner.
    const submissions = await store.listSubmissionsBySlug(slug);
    const isOwner = submissions.some((record) => record.ownerUid === uid);
    if (!isOperator && !isOwner) {
      reply.status(404).send({ error: 'not_found' });
      return null;
    }
    return { uid, isOperator, isOwner, published };
  }

  /** The newest job on this slug that has delivered something awaiting review. */
  async function findCandidate(slug: string, uid: string, isOperator: boolean): Promise<SubmissionRecord | null> {
    const submissions = await store.listSubmissionsBySlug(slug);
    const mine = isOperator ? submissions : submissions.filter((record) => record.ownerUid === uid);
    const awaiting = mine.filter(
      (record) =>
        !record.abandonedAt &&
        !record.publishedAt &&
        Boolean(record.deliveredVersion) &&
        (record.state === 'submitted' || record.state === 'gating' || record.state === 'ready_for_review'),
    );
    // Newest first: `listSubmissionsBySlug` promises that order, and a second delivery
    // on the same job supersedes the first rather than queueing behind it.
    return awaiting[0] ?? null;
  }

  app.get('/api/games/:slug/review', async (request, reply) => {
    const params = SlugParamsSchema.safeParse(request.params);
    if (!params.success || !SLUG_PATTERN.test(params.data.slug)) {
      return reply.status(400).send({ error: 'invalid slug' });
    }
    const slug = params.data.slug;
    const actor = await authorize(request, reply, slug);
    if (!actor) return;

    if (!gamesStore) {
      return reply.send({
        baselineVersion: null,
        candidate: null,
        diff: null,
        viewerIsOperator: actor.isOperator,
        canSignOff: actor.isOwner,
      } satisfies GameReviewResponse);
    }

    try {
      const publication = await store.getPublication(slug);
      const baselineVersion = publication?.state === 'published' ? publication.currentVersion : null;
      const record = await findCandidate(slug, actor.uid, actor.isOperator);

      if (!record?.deliveredVersion) {
        return reply.send({
          baselineVersion,
          candidate: null,
          diff: null,
          viewerIsOperator: actor.isOperator,
          canSignOff: actor.isOwner,
        } satisfies GameReviewResponse);
      }

      const candidateVersion = record.deliveredVersion;
      const manifest = await gamesStore.getManifest(slug, candidateVersion);
      const diff = baselineVersion
        ? await compareVersions(gamesStore, slug, baselineVersion, candidateVersion, manifest)
        : null;

      const body: GameReviewResponse = {
        baselineVersion,
        candidate: {
          version: candidateVersion,
          createdAt: manifest?.createdAt ?? record.stateSince ?? record.createdAt,
          jobId: record.issueNumber,
          title: record.title,
          gate: manifest?.gate
            ? {
                green: manifest.gate.green,
                ranAt: manifest.gate.ranAt,
                ...(manifest.gate.report ? { report: manifest.gate.report } : {}),
              }
            : null,
          ...(record.reviewApproval?.version === candidateVersion ? { approvedAt: record.reviewApproval.at } : {}),
        },
        diff,
        viewerIsOperator: actor.isOperator,
        canSignOff: actor.isOwner,
      };
      return reply.send(body);
    } catch (error) {
      request.log.error({ err: error, slug }, 'failed to build review');
      return reply.status(502).send({ error: 'failed to load review' });
    }
  });

  /**
   * The candidate, playable. Same shape as `GET /api/games/:slug` so the client can
   * hand it to the same frame — and, like that route, the document is the gate's own
   * bundle rather than anything assembled here.
   */
  app.get('/api/games/:slug/review/:version', async (request, reply) => {
    const params = VersionParamsSchema.safeParse(request.params);
    if (!params.success || !SLUG_PATTERN.test(params.data.slug) || !VERSION_PATTERN.test(params.data.version)) {
      return reply.status(400).send({ error: 'invalid request' });
    }
    const { slug, version } = params.data;
    const actor = await authorize(request, reply, slug);
    if (!actor) return;
    if (!gamesStore) return reply.status(503).send({ error: 'games are not configured' });

    // The version has to belong to a job this viewer may see — otherwise any owner
    // could name any version id and read another game's unpublished bundle.
    const record = await findCandidate(slug, actor.uid, actor.isOperator);
    if (!record || record.deliveredVersion !== version) {
      return reply.status(404).send({ error: 'not_found' });
    }

    try {
      const bundle = await gamesStore.getDerivedArtifact(slug, version, 'bundle.html');
      if (!bundle) return reply.status(409).send({ error: 'not_built' });
      return reply.send({ slug, title: record.title, html: bundle.toString('utf8') });
    } catch (error) {
      request.log.error({ err: error, slug, version }, 'failed to read candidate bundle');
      return reply.status(502).send({ error: 'failed to load candidate' });
    }
  });

  /**
   * The creator's sign-off. Records that they played it and accept it; an operator
   * still performs the publish. Refused on a candidate the gate has not passed —
   * accepting something unverified is not a verdict anyone should be able to record.
   */
  app.post(
    '/api/games/:slug/review/:version/approve',
    { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const params = VersionParamsSchema.safeParse(request.params);
      if (!params.success || !SLUG_PATTERN.test(params.data.slug) || !VERSION_PATTERN.test(params.data.version)) {
        return reply.status(400).send({ error: 'invalid request' });
      }
      const { slug, version } = params.data;
      const actor = await authorize(request, reply, slug);
      if (!actor) return;
      if (!gamesStore) return reply.status(503).send({ error: 'games are not configured' });

      // Operators review; only the owner signs off. The admin queue reads this back
      // as `creatorApprovedAt`, so an operator recording it would have the queue
      // report that the creator accepted a change they have never seen.
      if (!actor.isOwner) {
        return reply.status(403).send({ error: 'not_the_creator' });
      }

      const record = await findCandidate(slug, actor.uid, actor.isOperator);
      if (!record || record.deliveredVersion !== version) {
        return reply.status(404).send({ error: 'not_found' });
      }

      // Re-read from the manifest rather than trusting job state, for the same reason
      // the publish route does: state is derived on a poll, the manifest is what the
      // gate wrote, and this is the record an operator will act on.
      const manifest = await gamesStore.getManifest(slug, version);
      if (!manifest?.gate) return reply.status(409).send({ error: 'not_gated' });
      if (!manifest.gate.green) return reply.status(409).send({ error: 'gate_red' });

      const at = new Date(now()).toISOString();
      await store.setSubmissionReviewApproval(record.issueNumber, { version, at, by: actor.uid });
      return reply.send({ ok: true, version, approvedAt: at });
    },
  );
}

/** Reads both trees and counts the lines between them. Null when the base is unreadable. */
async function compareVersions(
  gamesStore: GamesStore,
  slug: string,
  baselineVersion: string,
  candidateVersion: string,
  candidateManifest: VersionManifest | null,
): Promise<SourceDiffSummary | null> {
  try {
    const baselineManifest = await gamesStore.getManifest(slug, baselineVersion);
    if (!baselineManifest || !candidateManifest) return null;
    const [before, after] = await Promise.all([
      readTree(gamesStore, slug, baselineVersion, baselineManifest),
      readTree(gamesStore, slug, candidateVersion, candidateManifest),
    ]);
    return summarizeSourceDiff(before, after);
  } catch {
    // The footnote is the least important thing on the page; losing it must not cost
    // the creator the comparison they came for.
    return null;
  }
}

async function readTree(
  gamesStore: GamesStore,
  slug: string,
  version: string,
  manifest: VersionManifest,
): Promise<Map<string, string>> {
  const entries = await Promise.all(
    manifest.sourceFiles.map(async (path) => [path, await gamesStore.getSourceFile(slug, version, path)] as const),
  );
  const tree = new Map<string, string>();
  for (const [path, content] of entries) {
    if (content !== null) tree.set(path, content);
  }
  return tree;
}
