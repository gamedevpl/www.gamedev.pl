import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PARAMS_KEY, parseEditorDefinition, type EditorDefinition } from './editor-contract.js';
import { EDITOR_FILE } from './editor-contract.js';
import { applyAssistPatches, assistEnabled, MAX_UTTERANCE_LENGTH, type EditorAssistant } from './editor-assist.js';
import { codeLaneEnabled, type VertexCodeLane } from './code-lane.js';
import { buildSuggestions } from './remix-suggestions.js';
import type { GamesStore } from './games-store.js';
import type { Store } from './store.js';
import type { ContentChecker } from './moderation.js';
import { logModerationRejection } from './moderation-metrics.js';
import { assembleGameHtml } from './assemble.js';
import type { GitHubClient } from './github-client.js';
import type { EditingGate } from './creation-limits.js';

/**
 * Remix: a player bends a published game while playing it.
 *
 * The product shape (ops repo: realtime-game-editing-plan §D) is that this is
 * play-first — retention and shares, with creator conversion as upside — so the
 * rules here follow from "ephemeral" rather than from "draft":
 *
 * **Signed-in only, for now** (owner decision, 2026-08-02). The design supports
 * anonymous remixing and the surface was built for it, but every route here
 * spends model calls on behalf of whoever asks, and during the closed beta a
 * session is what makes that spend attributable and rate-limitable per person
 * rather than per IP. Nothing else about the shape changes, so lifting this is
 * deleting a guard, not rebuilding a surface.
 *
 *  - **A remix never publishes.** There is no path from here into the games
 *    store, the catalog, or the gate. The only durable things it can produce are
 *    a share link of *declared parameter values* and a prefilled game concept —
 *    both of which go through the ordinary front doors.
 *  - **Params never touch this server.** A slider moves the running game over
 *    the existing `editor:content` bridge, client-side, in under a frame. Only
 *    natural language and code need a round trip, which is why those are the
 *    only routes here.
 *  - **The player never supplies code.** The session holds the accumulated
 *    source overrides server-side and the client holds only an id, so nothing a
 *    browser sends is ever compiled. What comes back is a whole document for the
 *    frame to swap in, built by the same assembler the play path uses.
 *
 * Sessions live in this instance's memory with a TTL. Deliberately not
 * Firestore: a remix is explicitly disposable, and a document per tweak would be
 * write traffic for something nobody may ever look at again.
 *
 * But the app service deploys with `--max-instances 4` (it is only pinned to 1
 * while party rooms live here — see `infra/deploy-api.sh`), so "this instance"
 * is not where the next request necessarily lands. Memory alone would mean a
 * player starts a remix on one container, types, and is told their remix expired
 * — intermittently, and therefore blamed on their wifi. So the *id* carries what
 * a session needs to exist: a container that has never seen it rebuilds it from
 * the id and serves the request. Memory is the cache; the id is the record.
 *
 * What survives a hop is everything the player can see: the game, its
 * declaration, and the parameter values (which the client holds and re-pushes).
 * What does not is the accumulated code edits, because those are the one thing
 * too big to put in a URL — a rebuilt session starts from the published game.
 * If remixes ever become durable (the "save this as yours" path growing teeth),
 * that is the moment to give them a real home.
 */

export const REMIX_TTL_MS = 60 * 60_000;
/** Sessions per instance. A remix is small; this is a memory ceiling, not a policy. */
export const MAX_REMIX_SESSIONS = 500;
/** Code edits per session — a bound on spend, and on how far a remix can drift. */
export const MAX_CODE_EDITS = 12;

interface RemixSession {
  id: string;
  /** Who started it. A remix id is not a bearer token — it is scoped to its owner. */
  ownerUid: string;
  slug: string;
  /** Engine ref the rebuild pins to. */
  ref: string;
  /** Every game-relative source, as delivered — the base every edit applies to. */
  sources: Record<string, string>;
  /** Accumulated edits, newest wins. Applied over `sources` on every rebuild. */
  overrides: Record<string, string>;
  /**
   * Whether the game's authoritative copy is the store's. It decides where a
   * rebuild's base comes from: a store game's files replace the ref's entirely,
   * a repo game keeps the ref as its base and carries only the edit.
   */
  fromStore: boolean;
  /**
   * Whether the game's own sources are in hand for the code lane to map.
   *
   * True from the start for a store-era game, which hands over its files at
   * publish. A repo-era game keeps them on the ref, and fetching them costs a
   * walk of its whole import graph — so it happens on the first request that
   * actually needs it, and once.
   */
  sourcesLoaded: boolean;
  definition: EditorDefinition | null;
  title: string;
  codeEdits: number;
  /**
   * A code rebuild is running for this session.
   *
   * One at a time, deliberately: two concurrent rebuilds race on `overrides`,
   * and the loser's edit silently lands on top of a base it never saw. The
   * client only ever has one in flight, so a second arrival is either a
   * double-tap or a retry after a client-side timeout — both of which want to
   * be told "still working", not to start a second paid run.
   */
  codeInFlight: boolean;
  expiresAt: number;
}

const StartSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
});
const AssistSchema = z.object({
  utterance: z.string().trim().min(2).max(MAX_UTTERANCE_LENGTH),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
const ShareSchema = z.object({
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

/**
 * The id is the session's record, so any container can answer for it.
 *
 * It carries only facts that are already the player's: which game, until when,
 * and a tag for whose it is. Everything authoritative — the engine ref, the
 * sources, whether the game is store-era — is re-derived from the catalog when a
 * session is rebuilt, never read out of the id, so a hand-edited id cannot point
 * a rebuild at a ref or a file list of its author's choosing.
 *
 * The owner is a hash rather than the uid itself: it keeps "an id is not a
 * bearer token" true across a hop without putting a real account id in a URL.
 * It is not a signature and does not need to be — the only claim it makes is one
 * the caller must already be able to make about themselves.
 */
function ownerTag(uid: string): string {
  return createHash('sha256').update(uid).digest('base64url').slice(0, 12);
}

/**
 * `1.<owner>.<expiry>.<nonce>.<slug>` — every part URL-safe, none containing a
 * dot, so it travels as a path segment without escaping. Deliberately not
 * base64url'd JSON: that ran to ~130 characters and Fastify's route parser
 * rejects a parameter over `MAX_REMIX_ID_LENGTH` before any handler sees it.
 */
export const MAX_REMIX_ID_LENGTH = 128;
const REMIX_ID_PATTERN = /^1\.([A-Za-z0-9_-]{12})\.([0-9a-z]{1,10})\.([A-Za-z0-9_-]{6})\.(.+)$/;

function mintRemixId(uid: string, slug: string, expiresAt: number): string {
  const nonce = randomBytes(6).toString('base64url').slice(0, 6);
  return `1.${ownerTag(uid)}.${expiresAt.toString(36)}.${nonce}.${slug}`;
}

function readRemixId(id: string): { uidTag: string; slug: string; expiresAt: number } | null {
  if (id.length > MAX_REMIX_ID_LENGTH) return null;
  const match = REMIX_ID_PATTERN.exec(id);
  if (!match) return null;
  const expiresAt = parseInt(match[2], 36);
  if (!Number.isFinite(expiresAt)) return null;
  if (!StartSchema.shape.slug.safeParse(match[4]).success) return null;
  return { uidTag: match[1], slug: match[4], expiresAt };
}

export interface RemixRoutesOptions {
  store?: Store;
  gamesStore?: GamesStore;
  githubClient?: GitHubClient;
  /** Ref the repo-published games are served from — the rebuild pins to it. */
  publishedRef?: string;
  assistant?: EditorAssistant;
  codeLane?: VertexCodeLane;
  contentChecker?: ContentChecker;
  /** The platform-wide editing spend breaker — both model lanes ride it. */
  editingGate?: EditingGate;
  /**
   * Whether the caller has hung up mid-rebuild. Defaults to the socket state;
   * injectable because that is the one thing a test cannot produce through
   * `inject()`, and the behaviour it guards — an abandoned edit must not land —
   * is worth pinning.
   */
  isAbandoned?: (request: FastifyRequest) => boolean;
  now?: () => number;
}

export async function registerRemixRoutes(app: FastifyInstance, options: RemixRoutesOptions): Promise<void> {
  const now = options.now ?? Date.now;
  const sessions = new Map<string, RemixSession>();

  /**
   * One slot off the day's platform-wide editing allowance, or an honest 503.
   * Runs after moderation and the per-route limits, immediately before the paid
   * call, so a refusal never spends anything and a spend is never refused late.
   */
  async function spendEditSlot(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    if (!options.editingGate) return true;
    const dateStr = new Date(now()).toISOString().slice(0, 10);
    const gate = await options.editingGate.checkAndSpend(request.user!.uid, dateStr);
    if (!gate.allowed) {
      reply.status(503).send({ error: 'editing is resting right now — the game still plays' });
      return false;
    }
    return true;
  }

  function sweep(): void {
    const currentTime = now();
    for (const [id, session] of sessions) {
      if (session.expiresAt <= currentTime) sessions.delete(id);
    }
    // A hard ceiling as well as a TTL: an hour of heavy traffic should not be
    // able to hold more than this instance can carry.
    while (sessions.size > MAX_REMIX_SESSIONS) {
      const oldest = sessions.keys().next().value;
      if (oldest === undefined) break;
      sessions.delete(oldest);
    }
  }

  /**
   * The beta gate. 401 rather than a silent no-op so the client can offer the
   * sign-in prompt instead of a button that does nothing.
   */
  function requireUser(request: FastifyRequest, reply: FastifyReply): boolean {
    if (!request.user) {
      reply.status(401).send({ error: 'sign in to remix' });
      return false;
    }
    if (request.user.tier === 'blocked') {
      reply.status(403).send({ error: 'account is blocked' });
      return false;
    }
    return true;
  }

  async function getSession(request: FastifyRequest): Promise<RemixSession | null> {
    sweep();
    const id = (request.params as { id?: string }).id;
    const uid = request.user?.uid;
    if (!id || !uid) return null;
    const session = sessions.get(id);
    if (session) {
      if (session.expiresAt <= now()) return null;
      // Someone else's remix is indistinguishable from an expired one, which is
      // the honest answer as well as the safe one.
      if (session.ownerUid !== uid) return null;
      return session;
    }
    return rehydrate(id, uid);
  }

  /**
   * This container has never seen this remix. Rebuild it, or say it is gone.
   *
   * Reached whenever the load balancer hands a follow-up request to a different
   * instance than the one that minted the id — the common case under any real
   * traffic, and the reason the id is self-describing. The game is re-read from
   * the catalog exactly as `start` reads it, so a rebuilt session is a session:
   * same declaration, same lanes, same ownership answer.
   *
   * Two things reset. Code edits are gone, because they only ever lived in the
   * instance that made them; the player's params come back from the client, so
   * what they see is what they had. And `codeEdits` restarts at zero, which
   * loosens the per-session spend bound — deliberately accepted, because the
   * per-route rate limit, the per-account daily cap and the platform breaker are
   * the bounds that actually hold, and none of them live in this map.
   */
  async function rehydrate(id: string, uid: string): Promise<RemixSession | null> {
    const claims = readRemixId(id);
    if (!claims || claims.expiresAt <= now()) return null;
    if (claims.uidTag !== ownerTag(uid)) return null;
    const loaded = await loadSources(claims.slug);
    if (!loaded) return null;
    const editorJson = loaded.sources[EDITOR_FILE];
    const session: RemixSession = {
      id,
      ownerUid: uid,
      slug: claims.slug,
      ref: loaded.ref,
      sources: loaded.sources,
      fromStore: loaded.fromStore,
      sourcesLoaded: loaded.fromStore,
      overrides: {},
      definition: editorJson ? parseEditorDefinition(editorJson).definition : null,
      title: claims.slug,
      codeEdits: 0,
      codeInFlight: false,
      expiresAt: claims.expiresAt,
    };
    sessions.set(id, session);
    sweep();
    return session;
  }

  /**
   * What this game is, and what it lets a player change.
   *
   * Two eras, one answer. A store-era game is authoritative in GCS and hands
   * over every source, so both lanes can work on it. A repo-era game keeps its
   * sources on the ref, and only its *declaration* is read here — two cheap
   * file reads rather than a full assembly.
   *
   * That split is deliberate and was learned the hard way: the first version
   * used `getGameSources` as an existence probe, which fetches the engine,
   * every module and every audio asset and then bundles — and wrapped it in a
   * catch that turned any GitHub hiccup into "game not found". Every remix on
   * the site answered that, with nothing in the logs to say why. Existence is
   * now a question about a manifest, and a read that *fails* is reported as a
   * failure rather than as an absence.
   */
  async function loadSources(
    slug: string,
  ): Promise<{ sources: Record<string, string>; ref: string; fromStore: boolean } | null> {
    const gamesStore = options.gamesStore;
    const publication = options.store ? await options.store.getPublication(slug) : null;
    if (gamesStore && publication?.state === 'published') {
      const manifest = await gamesStore.getManifest(slug, publication.currentVersion);
      if (!manifest) return null;
      const entries = await Promise.all(
        manifest.sourceFiles.map(async (path) => {
          const content = await gamesStore.getSourceFile(slug, publication.currentVersion, path);
          return content === null ? null : ([path, content] as const);
        }),
      );
      const sources = Object.fromEntries(entries.filter((entry): entry is [string, string] => entry !== null));
      return { sources, ref: manifest.engineRef ?? options.publishedRef ?? 'main', fromStore: true };
    }

    if (!options.githubClient || !options.publishedRef) return null;
    const ref = options.publishedRef;
    // GAME.json is the proof of existence — every game has one, and a missing
    // file is a real "no such game" rather than a swallowed error.
    const manifest = await options.githubClient.getGameFile(ref, slug, 'GAME.json');
    if (manifest === null) return null;
    const editorJson = await options.githubClient.getGameFile(ref, slug, EDITOR_FILE);
    // Declaration only: a repo game's code stays on the ref (the assembler reads
    // it there), so the code lane has no file list to map and says so, while the
    // params lane works on exactly the games that declare params.
    return {
      sources: editorJson === null ? {} : { [EDITOR_FILE]: editorJson },
      ref,
      fromStore: false,
    };
  }

  /** Rebuild the whole document with the session's edits applied. */
  async function rebuild(session: RemixSession, extra: Record<string, string> = {}): Promise<string | null> {
    if (!options.githubClient) return null;
    const overrides = { ...session.overrides, ...extra };
    const sources = await options.githubClient.getGameSources(session.ref, session.slug, {
      // A store game's files replace the ref's entirely (its code lives in GCS);
      // a repo game keeps the ref as its base and only carries the edit.
      ...(session.fromStore ? session.sources : {}),
      ...overrides,
    });
    if (!sources) return null;
    return assembleGameHtml(
      { title: session.title, description: '', html: sources.indexHtml, js: sources.gameJs, css: sources.styleCss },
      { restrictNetwork: true },
    );
  }

  app.post(
    '/api/games/:slug/remix',
    { config: { rateLimit: { max: 20, timeWindow: 60_000 } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return;
      const params = StartSchema.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: 'invalid game id' });
      const loaded = await loadSources(params.data.slug);
      if (!loaded) return reply.status(404).send({ error: 'game not found' });

      const editorJson = loaded.sources[EDITOR_FILE];
      const definition = editorJson ? parseEditorDefinition(editorJson).definition : null;
      const expiresAt = now() + REMIX_TTL_MS;
      const id = mintRemixId(request.user!.uid, params.data.slug, expiresAt);
      sweep();
      sessions.set(id, {
        id,
        ownerUid: request.user!.uid,
        slug: params.data.slug,
        ref: loaded.ref,
        sources: loaded.sources,
        fromStore: loaded.fromStore,
        sourcesLoaded: loaded.fromStore,
        overrides: {},
        definition,
        title: params.data.slug,
        codeEdits: 0,
        codeInFlight: false,
        expiresAt,
      });

      const canAssist = Boolean(options.assistant && assistEnabled() && definition?.params);
      // Every era, now: a repo-era game's sources are reachable through the
      // bundler's own walk, so the deep lane is no longer a store-only
      // privilege. Whether *this* game can actually be assembled is answered
      // on the first request that needs it rather than paid for here.
      const canCode = Boolean(options.codeLane && codeLaneEnabled());
      return reply.send({
        remixId: id,
        // The declaration drives the sliders; its defaults are the starting values.
        params: definition?.params ?? null,
        values: definition?.params
          ? Object.fromEntries(Object.entries(definition.params).map(([key, spec]) => [key, spec.default]))
          : null,
        canAssist,
        canCode,
        // What is worth saying here, derived from what this game can do.
        suggestions: buildSuggestions(definition, { canAssist, canCode }),
        expiresInMs: REMIX_TTL_MS,
      });
    },
  );

  app.post(
    '/api/remixes/:id/assist',
    { config: { rateLimit: { max: 20, timeWindow: 60_000 } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return;
      const session = await getSession(request);
      if (!session) return reply.status(404).send({ error: 'this remix has expired — start a new one' });
      if (!options.assistant || !assistEnabled() || !session.definition?.params) {
        return reply.status(503).send({ error: 'tuning by request is not available here' });
      }
      const body = AssistSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: 'invalid request' });

      // Anonymous players reach a model here, so the same fail-closed check every
      // other creator-text path uses runs first, before a paid call.
      if (options.contentChecker) {
        const verdict = await options.contentChecker.check(body.data.utterance);
        if (!verdict.allowed) {
          logModerationRejection(request.log, {
            surface: 'remix_assist',
            uid: request.user?.uid,
            category: verdict.category,
          });
          return reply.status(422).send({ error: 'that request was rejected' });
        }
      }

      if (!(await spendEditSlot(request, reply))) return;

      const content = { [PARAMS_KEY]: body.data.params ?? {} };
      try {
        const result = await options.assistant.assist({
          definition: session.definition,
          content,
          utterance: body.data.utterance,
          game: { title: session.title },
        });
        if (result.lane !== 'params' || !result.patches?.length) {
          return reply.send({
            lane: result.lane === 'params' ? 'code' : result.lane,
            ...(result.summary ? { summary: result.summary } : {}),
          });
        }
        const applied = applyAssistPatches(session.definition, content, result.patches);
        if (applied.patches.length === 0) {
          return reply.send({ lane: 'code', ...(result.summary ? { summary: result.summary } : {}) });
        }
        return reply.send({
          lane: 'params',
          patches: applied.patches,
          values: applied.content[PARAMS_KEY],
          ...(result.summary ? { summary: result.summary } : {}),
        });
      } catch {
        return reply.status(503).send({ error: 'the assistant did not answer — try again' });
      }
    },
  );

  app.post(
    '/api/remixes/:id/code',
    { config: { rateLimit: { max: 6, timeWindow: 60_000 } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return;
      const session = await getSession(request);
      if (!session) return reply.status(404).send({ error: 'this remix has expired — start a new one' });
      if (!options.codeLane || !codeLaneEnabled()) {
        return reply.status(503).send({ error: 'code changes are not available here' });
      }
      // A repo-era game keeps its code on the ref, so the lane has nothing to map
      // regions in until the sources are in hand. Fetched here rather than at
      // `start` because it costs a full walk of the game's import graph, and the
      // overwhelming majority of remixes never ask for a rebuild — the cost lands
      // on the request that needs it, once per session.
      if (!session.fromStore && !session.sourcesLoaded) {
        let sources: Record<string, string> | null;
        try {
          sources = options.githubClient
            ? await options.githubClient.getGameSourceMap(session.ref, session.slug)
            : null;
        } catch (error) {
          // A pipeline that broke is not a game we decided not to support, and
          // the two must not arrive as the same sentence. This one is ours: it
          // is logged with the cause, and answered as a fault the player can
          // retry rather than as a limit they cannot.
          request.log.error(
            { err: error, slug: session.slug, ref: session.ref },
            'remix code lane could not read a game source map',
          );
          return reply.status(503).send({
            error: 'editing is resting right now — the game still plays',
            reason: 'sources_unavailable',
          });
        }
        if (!sources) {
          // No entry point. A fact about this game, and the only absence this
          // route reports as one.
          return reply.status(409).send({ error: 'this game cannot be remixed that deeply yet', reason: 'no_sources' });
        }
        // The declaration already in hand stays: it is not part of the import
        // graph, and the params lane is still reading it.
        session.sources = { ...session.sources, ...sources };
        session.sourcesLoaded = true;
      }
      if (session.codeEdits >= MAX_CODE_EDITS) {
        return reply.status(429).send({ error: "that's as far as this remix goes — start a new one" });
      }
      const body = AssistSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: 'invalid request' });

      if (options.contentChecker) {
        const verdict = await options.contentChecker.check(body.data.utterance);
        if (!verdict.allowed) {
          logModerationRejection(request.log, {
            surface: 'remix_code',
            uid: request.user?.uid,
            category: verdict.category,
          });
          return reply.status(422).send({ error: 'that request was rejected' });
        }
      }

      if (session.codeInFlight) {
        return reply.status(409).send({ error: 'still working on your last change' });
      }
      if (!(await spendEditSlot(request, reply))) return;

      /**
       * Did the player walk away while we worked?
       *
       * The client aborts its fetch at its own timeout and tells the player
       * their game came back untouched. Nothing about that reaches this
       * handler, so without this check the rebuild would finish anyway and
       * write itself into the session — and the *next* edit would silently
       * build on a change the player was told had been discarded. The socket
       * closing is the only signal we get, and it is enough: an abandoned run
       * is discarded here, which makes the client's promise true.
       */
      let clientGone = false;
      // On the *response*, not the request. `request.raw.destroyed` reads as
      // "the client hung up" and is not: Node destroys the request stream once
      // its body has been consumed, which for any request with a JSON payload is
      // always — so in production this fired on every single edit, the finished
      // rebuild was discarded, and the route answered 200 with an empty body.
      // `inject()` never reproduced it, because a mock request is never a stream
      // that ends. The response socket closing before the reply is written is
      // the one event that actually means nobody is listening.
      reply.raw.on('close', () => {
        if (!reply.raw.writableFinished) clientGone = true;
      });
      const abandoned = () => (options.isAbandoned ? options.isAbandoned(request) : clientGone);

      session.codeInFlight = true;
      try {
        const current = { ...session.sources, ...session.overrides };
        const outcome = await options.codeLane.run(
          { slug: session.slug, sources: current, utterance: body.data.utterance, game: { title: session.title } },
          async (candidate) => {
            // "Does it build" is answered by building the real document — the same
            // assembler, CSP and caps the play path applies — so a green answer here
            // means the frame can actually run it.
            try {
              const html = await rebuild(session, candidate);
              return html ? { ok: true } : { ok: false, errors: ['the game could not be assembled'] };
            } catch (error) {
              return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
            }
          },
        );

        if (!outcome.ok) {
          return reply.send({
            ok: false,
            reason: outcome.reason,
            ...(outcome.summary ? { summary: outcome.summary } : {}),
          });
        }

        if (abandoned()) {
          // The spend already happened and is not refundable — but the *edit* is,
          // and discarding it is what the player was promised. Logged because a
          // pattern of these is the signal that the timeout is set too tight.
          request.log.info(
            { slug: session.slug, region: outcome.region },
            'remix code edit abandoned before it landed',
          );
          // Answered rather than dropped. Nobody is listening by definition, but
          // a handler that returns without replying leaves Fastify holding an
          // open request — which is what an abandoned edit looked like from the
          // outside: a 200 with nothing in it.
          return reply.status(499).send({ ok: false, reason: 'abandoned' });
        }

        session.overrides = { ...session.overrides, ...outcome.overrides };
        session.codeEdits += 1;
        session.expiresAt = now() + REMIX_TTL_MS;
        const html = await rebuild(session);
        if (!html) return reply.status(500).send({ ok: false, reason: 'error' });
        return reply.send({
          ok: true,
          html,
          region: outcome.region,
          ...(outcome.summary ? { summary: outcome.summary } : {}),
        });
      } finally {
        session.codeInFlight = false;
      }
    },
  );

  /**
   * The share gate.
   *
   * Only *declared parameter values* travel: they are bounded by the game's own
   * schema, so a link cannot carry anything the sliders could not have produced.
   * Code edits deliberately do not travel — sharing generated code would put
   * ungated, unreviewed JavaScript in front of strangers, which is the one thing
   * the gate exists to prevent. Text parameters are the only free-form surface
   * and go through moderation before a link exists.
   */
  app.post(
    '/api/remixes/:id/share',
    { config: { rateLimit: { max: 10, timeWindow: 60_000 } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return;
      const session = await getSession(request);
      if (!session) return reply.status(404).send({ error: 'this remix has expired — start a new one' });
      const body = ShareSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: 'invalid request' });
      const specs = session.definition?.params;
      if (!specs) return reply.status(409).send({ error: 'there is nothing to share yet' });

      const values = body.data.params ?? {};
      const texts = Object.entries(specs)
        .filter(([name, spec]) => spec.type === 'text' && typeof values[name] === 'string')
        .map(([name]) => values[name] as string)
        .filter((text) => text.trim().length > 0);
      if (texts.length > 0 && options.contentChecker) {
        const verdict = await options.contentChecker.checkFields(texts);
        if (!verdict.allowed) {
          logModerationRejection(request.log, {
            surface: 'remix_share',
            uid: request.user?.uid,
            category: verdict.category,
          });
          return reply.status(422).send({ error: 'that text was rejected' });
        }
      }
      // Validated against the declaration, so a hand-edited link cannot smuggle a
      // value the game never allowed.
      const { patches } = applyAssistPatches(
        session.definition!,
        { [PARAMS_KEY]: Object.fromEntries(Object.entries(specs).map(([key, spec]) => [key, spec.default])) },
        Object.entries(values).map(([key, value]) => ({ key, value })),
      );
      const shared = Object.fromEntries(patches.map((patch) => [patch.key, patch.value]));
      return reply.send({
        slug: session.slug,
        params: shared,
        /** Compact enough for a URL; the play page validates it again on arrival. */
        code: Buffer.from(JSON.stringify(shared), 'utf8').toString('base64url'),
        codeEditsExcluded: session.codeEdits > 0,
      });
    },
  );
}
