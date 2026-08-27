import { gunzipSync } from 'node:zlib';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DEFAULT_SIGNED_URL_TTL_SECONDS, type GcsObjectStore } from '../delivery/gcs-sign.js';
import { KitRegistryError, parseKitRegistry, parseKitSidecar } from '../platform/kit-registry.js';
import { codeSurfaceEnabled } from './code-surface.js';
import { collapseJobsToOwnerGames, MAX_OWNER_GAMES, pageOwnerGames } from './owner-games.js';
import { readTarEntries, type TarEntry } from '../platform/tar.js';
import { hydrateRecentBuildSummaries } from '../delivery/build-changelog.js';
import { toRecentBuilds } from '../delivery/recent-builds.js';
import type {
  StudioBuildsResponse,
  StudioGame,
  StudioGamesResponse,
  StudioHealthResponse,
  StudioScorecard,
  StudioScorecardsResponse,
} from '@gamedevpl/contract';
import { recentPartitions, summarizeGameHealth } from '../platform/telemetry-health.js';

export type CreatorStudioGame = StudioGame;
export type CreatorHealthResponse = StudioHealthResponse;
export type CreatorScorecardSummary = StudioScorecard;
export type CreatorScorecardsResponse = StudioScorecardsResponse;
export type CreatorStudioGamesResponse = StudioGamesResponse;
export type CreatorBuildsResponse = StudioBuildsResponse;
import { composeWorkspaceArchive, WorkspaceCompositionError } from '../delivery/workspace-archive.js';
import type { GamesStore } from '../delivery/games-store.js';
import type { Store, TelemetryEvent } from '../platform/store.js';
import { normalizeLocale } from '../platform/translate.js';
import { isPublished } from '../platform/publication-state.js';

/**
 * Creator control panel reads (docs/improvement-loop-plan.md IL-2 creator surface).
 *
 * The operator health view covers every published game; this one is scoped to the
 * signed-in creator's own submissions. Attribution runs through `ownerUid` + `slug`,
 * so a game never commissioned here (no submission document) correctly stays out —
 * the creator has nothing to manage for it.
 *
 * Aggregates only. Error message samples are the one attacker-controlled field; they
 * are safe to render as text in the studio and unsafe to feed to an agent unfenced.
 */

const MAX_DAYS = 30;
const DEFAULT_DAYS = 7;
const MAX_EVENTS_PER_DAY = 1000;
const MAX_EVENTS_PER_REQUEST = 5_000;

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(MAX_DAYS).optional(),
});

const ShelfQuerySchema = z.object({
  game: z.string().trim().min(1).max(512).optional(),
});

export interface CreatorStudioRoutesOptions {
  store: Store;
  /** Read manifests to learn which games ship an editor definition (EditorKit). */
  gamesStore?: GamesStore;
  /** Mints status tokens so the studio can deep-link into the build page. */
  mintStatusToken?: (issueNumber: number) => string;
  /** Reads the workspace scaffold and signs the kit URL the scaffold fetches. */
  objectStore?: GcsObjectStore;
  now?: () => number;
}

/** Ceiling on the scaffold we will unpack — it is a handful of text files, not a kit. */
const MAX_SCAFFOLD_BYTES = 1024 * 1024;

/**
 * Reads play events for a fixed set of slugs under one shared document budget.
 *
 * Per-slug queries (not a full-partition scan) so a quiet creator's niche game is not
 * crowded out of the budget by everyone else's traffic — the opposite problem from the
 * operator view, which deliberately covers the whole catalog.
 */
async function scanOwnedSlugs(
  store: Store,
  slugs: string[],
  days: string[],
): Promise<{ events: TelemetryEvent[]; scanned: string[]; truncated: boolean }> {
  const events: TelemetryEvent[] = [];
  const scanned: string[] = [];
  let truncated = false;

  for (const dateStr of days) {
    let dayHadRoom = false;
    for (const slug of slugs) {
      const remaining = MAX_EVENTS_PER_REQUEST - events.length;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      const limit = Math.min(MAX_EVENTS_PER_DAY, remaining);
      const dayEvents = await store.listTelemetryEvents(dateStr, { slug, limit });
      if (dayEvents.length >= limit) truncated = true;
      events.push(...dayEvents);
      dayHadRoom = true;
    }
    if (!dayHadRoom && events.length >= MAX_EVENTS_PER_REQUEST) {
      truncated = true;
      break;
    }
    if (dayHadRoom) scanned.push(dateStr);
    if (events.length >= MAX_EVENTS_PER_REQUEST) {
      truncated = true;
      break;
    }
  }

  return { events, scanned, truncated };
}

export async function registerCreatorStudioRoutes(
  app: FastifyInstance,
  options: CreatorStudioRoutesOptions,
): Promise<void> {
  const { store } = options;
  const now = options.now ?? Date.now;

  function requireUser(
    request: { user?: { uid: string; tier?: string } | null },
    reply: {
      status: (code: number) => { send: (body: unknown) => unknown };
    },
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

  /**
   * The creator's shelf: every non-abandoned submission, with the fields the studio
   * needs to render without a follow-up status poll (slug + publishedAt). Tokens are
   * re-minted so a fresh device recovers access.
   */
  app.get('/api/me/studio', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    if (!options.mintStatusToken) {
      return reply.status(503).send({ error: 'submissions are not configured' });
    }

    const parsed = ShelfQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid query' });
    }

    const records = await store.listSubmissionsByOwner(request.user!.uid);
    const collapsed = collapseJobsToOwnerGames(records, 'shelf');
    const total = collapsed.length;
    const truncated = total > MAX_OWNER_GAMES;
    const shelf = collapsed.slice(0, MAX_OWNER_GAMES);

    // A profile deep link must keep working even when its game has fallen below the
    // 50-row shelf. Resolve only against this creator's records, then append the
    // collapsed tip for that game so legacy capability-token URLs keep working too.
    const requested = parsed.data.game;
    if (requested) {
      const addressedRecord = records.find(
        (record) => record.slug === requested || options.mintStatusToken!(record.issueNumber) === requested,
      );
      const addressedGame = addressedRecord
        ? collapsed.find(({ tip }) =>
            addressedRecord.slug ? tip.slug === addressedRecord.slug : tip.issueNumber === addressedRecord.issueNumber,
          )
        : undefined;
      if (addressedGame && !shelf.includes(addressedGame)) shelf.push(addressedGame);
    }

    // previewVersion first, deliveredVersion as fallback (same order as get_sources)
    // — not gated on publish or the gate outcome, so mid-round iteration counts too.
    // One manifest read per game, best-effort: a failed read only costs the Edit pill.
    const editableSlugs = new Set<string>();
    if (options.gamesStore) {
      await Promise.all(
        shelf
          .filter(({ tip }) => tip.slug && (tip.previewVersion || tip.deliveredVersion))
          .map(async ({ tip }) => {
            const version = (tip.previewVersion ?? tip.deliveredVersion) as string;
            const manifest = await options.gamesStore!.getManifest(tip.slug as string, version).catch(() => null);
            if (manifest?.sourceFiles.includes('EDITOR.json')) editableSlugs.add(tip.slug as string);
          }),
      );
    }

    // publishedAt/catalogPublishedAt are history and stay; liveness is getPublication's call.
    const notLiveSlugs = new Set<string>();
    await Promise.all(
      shelf
        .filter(({ tip, catalogPublishedAt }) => tip.slug && (tip.publishedAt || catalogPublishedAt))
        .map(async ({ tip }) => {
          const publication = await store.getPublication(tip.slug as string);
          if (publication && !isPublished(publication)) notLiveSlugs.add(tip.slug as string);
        }),
    );

    const games: CreatorStudioGame[] = shelf.map(({ tip, catalogPublishedAt }) => ({
      token: options.mintStatusToken!(tip.issueNumber),
      title: tip.title,
      createdAt: tip.createdAt,
      // Prefer `lastStatus` (kept current on every derivation, and written at publish)
      // over `lastNotifiedStatus` (only moves when a notification fires — `in_review`
      // shares an event with `building`, so the studio would otherwise keep saying
      // "building" for a game waiting on review, or for one that just went live).
      lastKnownStatus: tip.lastStatus ?? tip.lastNotifiedStatus ?? null,
      ...(tip.slug ? { slug: tip.slug } : {}),
      ...(tip.publishedAt ? { publishedAt: tip.publishedAt } : {}),
      ...(catalogPublishedAt ? { livePublishedAt: catalogPublishedAt } : {}),
      ...(tip.slug && notLiveSlugs.has(tip.slug) ? { live: false as const } : {}),
      ...(tip.draftSharedAt ? { draftShared: true } : {}),
      ...(tip.slug && editableSlugs.has(tip.slug) ? { editable: true } : {}),
      ...(codeSurfaceEnabled() ? { codeSurface: true } : {}),
    }));

    return reply.send({ games, truncated, totalGames: total });
  });

  /**
   * Per-game play health for the creator's own published slugs only.
   *
   * Same aggregator as the operator view — one definition of "sessions / bounces /
   * stalls" — filtered to games this uid owns and has published. Draft-only slugs
   * are playable via share links but are not yet "live" funnel subjects, so they
   * stay out of the scorecard.
   */
  app.get('/api/me/studio/health', async (request, reply) => {
    if (!requireUser(request, reply)) return;

    const parsed = QuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid query' });
    }

    const records = await store.listSubmissionsByOwner(request.user!.uid);
    const { games: published, truncated: gamesTruncated, total } = pageOwnerGames(records, 'published');
    const slugs = published.map(({ tip }) => tip.slug).filter((slug): slug is string => Boolean(slug));

    if (slugs.length === 0) {
      const body: CreatorHealthResponse = {
        days: [],
        truncated: false,
        gamesTruncated: gamesTruncated,
        totalGames: total,
        games: [],
      };
      return reply.send(body);
    }

    const requested = recentPartitions(parsed.data.days ?? DEFAULT_DAYS, now());
    const { events, scanned, truncated } = await scanOwnedSlugs(store, slugs, requested);
    const owned = new Set(slugs);
    const games = summarizeGameHealth(events).filter((game) => owned.has(game.slug));

    const body: CreatorHealthResponse = {
      days: scanned,
      truncated,
      gamesTruncated,
      totalGames: total,
      games,
    };
    return reply.send(body);
  });

  /**
   * Votes and feedback themes for the creator's own published games.
   *
   * The third of IL-2's exit questions — "what do they say" — which the health route above
   * cannot answer at any window size, because votes, feedback and themes are not derived
   * from play events at all. Reads the scorecards the nightly sweep already wrote: cheap
   * (one document per game), and it means the studio and the weekly digest cannot report
   * different numbers, since both read the same document.
   *
   * A game with no scorecard is simply absent from the list rather than present with
   * zeros — it has not been measured, which is not the same as having been measured as
   * nothing.
   */
  app.get('/api/me/studio/scorecards', async (request, reply) => {
    if (!requireUser(request, reply)) return;

    const records = await store.listSubmissionsByOwner(request.user!.uid);
    const { games: published, truncated, total } = pageOwnerGames(records, 'published');
    const slugs = published.map(({ tip }) => tip.slug).filter((slug): slug is string => Boolean(slug));

    const cards = await Promise.all(slugs.map((slug) => store.getScorecard(slug)));
    const scorecards: CreatorScorecardSummary[] = cards
      .filter((card): card is NonNullable<typeof card> => card !== null)
      .map((card) => ({
        slug: card.slug,
        computedAt: card.computedAt,
        windowDays: card.window.days.length,
        truncated: card.window.truncated,
        votes: card.votes,
        feedbackCount: card.feedback.count,
        untrustedThemes: card.untrusted.feedbackThemes ?? [],
      }));

    const body: CreatorScorecardsResponse = { scorecards, truncated, totalGames: total };
    return reply.send(body);
  });

  const BuildsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    locale: z.string().trim().max(10).optional(),
  });

  // List build history for an owned game.
  app.get<{ Params: { slug: string } }>('/api/me/studio/games/:slug/builds', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    if (!options.gamesStore?.listVersions) {
      return reply.status(503).send({ error: 'games store is not configured' });
    }

    const slug = request.params.slug;
    if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(slug)) {
      return reply.status(400).send({ error: 'invalid slug' });
    }

    const records = await store.listSubmissionsByOwner(request.user!.uid);
    const owned = records.some((record) => record.slug === slug);
    if (!owned) {
      return reply.status(404).send({ error: 'no such game' });
    }

    const parsed = BuildsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid query' });
    }

    const limit = parsed.data.limit ?? 50;
    const offset = parsed.data.offset ?? 0;
    const allVersions = await options.gamesStore.listVersions(slug, { limit: offset + limit });
    const pagedVersions = allVersions.slice(offset, offset + limit);
    const totalCount = options.gamesStore.countVersions
      ? await options.gamesStore.countVersions(slug)
      : allVersions.length;
    const locale = normalizeLocale(parsed.data.locale ?? records.find((record) => record.slug === slug)?.locale);

    const body: CreatorBuildsResponse = {
      builds: await hydrateRecentBuildSummaries({
        builds: toRecentBuilds(pagedVersions),
        ...(locale ? { locale } : {}),
        loadEvents: (issueNumber) => store.listBuildEvents(issueNumber, { limit: 20 }),
      }),
      totalCount,
    };
    return reply.send(body);
  });

  /**
   * A working copy of the creator's own game, for creators who would rather use their
   * own IDE than the Studio's agent flow.
   *
   * This is a checkout, not a handover: the archive is sources plus the scaffold that
   * fetches the toolchain and explains how to deliver back, and the game keeps its home
   * here. Nothing about the round trip changes — the creator's agent still opens a round
   * and calls `submit_sources`, the site's gate still rebuilds against its own pinned
   * engine, and a human still publishes. See `workspace-archive.ts` for what is in the
   * archive and why GameKit is not.
   *
   * Ownership is the same `ownerUid` + `slug` attribution the rest of this file uses, so
   * a slug the caller did not commission 404s rather than 403s — a creator has no reason
   * to learn which other slugs exist.
   */
  app.get<{ Params: { slug: string } }>(
    '/api/me/studio/games/:slug/workspace',
    // The most expensive read a signed-in creator can ask for: up to 200 source-object
    // reads, the registry and scaffold on top, and a gzip held in memory. The rate-limit
    // plugin is registered with `global: false`, so a route that says nothing has no
    // ceiling at all. Generous against real use — nobody checks out a game 30 times an
    // hour — and bounded against a loop.
    { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return;
      if (!options.gamesStore || !options.objectStore) {
        return reply.status(503).send({ error: 'workspace checkout is not configured on this deployment' });
      }

      const slug = request.params.slug;
      if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(slug)) {
        return reply.status(400).send({ error: 'invalid slug' });
      }

      const records = await store.listSubmissionsByOwner(request.user!.uid);
      // Canceled rounds are excluded as well as abandoned ones, matching the shelf the
      // creator is looking at when they click this. A round the operator canceled can still
      // carry a preview or delivery, and it is newer than the job that published the live
      // game — so keeping it would hand back work that was rejected, and a delivery built on
      // it would overwrite what is live. That is the same hazard as picking a stale record,
      // reached from the other direction.
      const owned = records.filter(
        (record) => record.slug === slug && !record.abandonedAt && record.state !== 'canceled',
      );
      if (owned.length === 0) {
        return reply.status(404).send({ error: 'no such game' });
      }

      // Same preference order as the agent's own `get_sources`, and it has to be read off
      // the *newest* round rather than the first owned record that happens to carry a
      // version. An improvement round starts empty on a slug whose older job still points
      // at the version it delivered before publication; scanning all records would hand
      // back that older delivery, and a creator who edited it and delivered would overwrite
      // newer published work with something derived from a superseded base. When the newest
      // round has nothing of its own, the live publication is what they last played.
      const tip = [...owned].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      let version = tip.previewVersion ?? tip.deliveredVersion ?? null;
      if (!version) {
        const publication = await store.getPublication(slug);
        if (isPublished(publication)) version = publication.currentVersion;
      }
      if (!version) {
        return reply.status(409).send({
          error: 'nothing_delivered',
          message: 'this game has no delivered version yet — let the first build finish, then check it out',
        });
      }

      const manifest = await options.gamesStore.getManifest(slug, version);
      if (!manifest) {
        request.log.error({ slug, version }, 'workspace checkout: manifest missing for a version a job points at');
        return reply.status(502).send({ error: 'the delivered version could not be read back' });
      }

      const sources = await Promise.all(
        manifest.sourceFiles.map(async (path) => ({
          path,
          content: await options.gamesStore!.getSourceFile(slug, version, path),
        })),
      );
      const missing = sources.filter((file) => file.content === null).map((file) => file.path);
      if (missing.length > 0) {
        request.log.error(
          { slug, version, missing },
          'workspace checkout: version is missing files its manifest lists',
        );
        return reply.status(502).send({ error: 'the delivered version could not be read back' });
      }

      try {
        const registryBody = await options.objectStore.readObject('kits/current.json');
        if (!registryBody) {
          return reply.status(503).send({
            error: 'kit_registry_missing',
            message: 'the Creator Kit registry is not published yet',
          });
        }
        const engineRef = parseKitRegistry(registryBody.toString('utf8')).current;

        const sidecarBody = await options.objectStore.readObject(`kits/${engineRef}.json`);
        const scaffoldBody = await options.objectStore.readObject(`workspaces/${engineRef}.tgz`);
        if (!sidecarBody || !scaffoldBody) {
          return reply.status(503).send({
            error: 'workspace_scaffold_missing',
            message: `no workspace scaffold published for engine ${engineRef}`,
          });
        }

        // Bounded at the gunzip, not only after it: `readTarEntries`' cap is on what it
        // retains, so an over-large or corrupt scaffold would already have been inflated
        // in full by the time that applied. The scaffold is our own artifact rather than
        // creator input, so this guards a mispublish rather than an attacker — but the
        // cost of being wrong about that is the API's memory, and the bound is one option.
        const scaffold: TarEntry[] = [];
        try {
          const unpacked = gunzipSync(scaffoldBody, { maxOutputLength: MAX_SCAFFOLD_BYTES });
          async function* once(): AsyncGenerator<Uint8Array> {
            yield unpacked;
          }
          for await (const item of readTarEntries(once(), { maxTotalBytes: MAX_SCAFFOLD_BYTES })) {
            scaffold.push(item);
          }
        } catch (error) {
          // Unreadable is the same class of problem as invalid, and gets the same answer:
          // a controlled 502 naming an operator problem, rather than a 500 that reads to
          // the creator as "the site is broken" and to us as an unhandled exception.
          throw new WorkspaceCompositionError(
            `workspace scaffold for engine ${engineRef} could not be read: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }

        const archive = composeWorkspaceArchive({
          slug,
          lock: {
            slug,
            engineRef,
            // Short-lived by design. `setup.mjs` is meant to be re-run — that is also the
            // re-baseline path when the pin falls outside the kit's N/N−1 window — so a URL
            // that expires costs a fresh checkout link, not a broken workspace.
            kitUrl: await options.objectStore.signReadUrl(`kits/${engineRef}.tgz`, DEFAULT_SIGNED_URL_TTL_SECONDS),
            kitSha256: parseKitSidecar(sidecarBody.toString('utf8')).sha256,
            issuedAt: new Date(now()).toISOString(),
          },
          scaffold,
          sources: sources as Array<{ path: string; content: string }>,
        });

        return (
          reply
            .header('content-type', 'application/gzip')
            .header('content-disposition', `attachment; filename="${slug}-workspace.tgz"`)
            // The signed kit URL inside makes every archive short-lived and per-creator.
            .header('cache-control', 'private, no-store')
            .send(archive)
        );
      } catch (error) {
        if (error instanceof KitRegistryError) {
          return reply.status(503).send({ error: error.code, message: error.message });
        }
        if (error instanceof WorkspaceCompositionError) {
          // A scaffold that fails its own invariants is an operator problem, not the
          // creator's: refuse rather than hand over an archive we cannot vouch for.
          request.log.error({ slug, err: error }, 'workspace checkout: refused to compose an archive');
          return reply.status(502).send({ error: 'the workspace could not be assembled' });
        }
        throw error;
      }
    },
  );
}
