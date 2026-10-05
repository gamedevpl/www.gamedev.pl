import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  EDITOR_CONTENT_FILE,
  EDITOR_FILE,
  PARAMS_KEY,
  parseEditorDefinition,
  type EditorDefinition,
} from './editor-contract.js';
import { applyAssistPatches, assistEnabled, MAX_UTTERANCE_LENGTH, type EditorAssistant } from './editor-assist.js';
import { rememberRemixTurn, type RemixTurn } from './remix-turns.js';
import { codeLaneDebugEnabled, codeLaneEnabled, type VertexCodeLane } from './code-lane.js';
import { typeCheckGame } from './type-check.js';
import { remixClientPayload } from './remix-view.js';
import type { GamesStore } from '../delivery/games-store.js';
import type { Store } from '../platform/store.js';
import { replyModerationBlock, isModerationBlock, type ContentChecker } from '../platform/moderation.js';
import { logModerationRejection } from '../platform/moderation-metrics.js';
import { peekQuota } from '../platform/quota-peek.js';
import { assembleGameHtml, projectFromSources } from '../platform/assemble.js';
import type { GitHubClient } from '../catalog/github-client.js';
import { type EditingGate } from './creation-limits.js';
import {
  bakeRemixEditorDefaults,
  collectEditorTextFields,
  defaultCollections,
  remixHasSavableChange,
  type RemixSaveContent,
  type RemixSaveParams,
} from './remix-bake.js';
import { mintShareCode, sharedTexts, validateSharedParams } from './remix-share.js';
import { registerSharedTuneRoute } from './remix-shared-tune.js';
import { safeSummary, screenCodeLaneOutput } from './code-lane-filter.js';
import type { OpenProposalInput, OpenProposalResult, ProposalDeps } from '../community/proposals.js';
import {
  MAX_PROPOSAL_DESCRIPTION_LENGTH,
  MAX_PROPOSAL_TITLE_LENGTH,
  MIN_PROPOSAL_DESCRIPTION_LENGTH,
  PROPOSAL_NO_JOB,
} from '../platform/proposal-limits.js';
import type { ProposalBase } from '../platform/store.js';
import type { SourceFile } from '../delivery/games-store.js';
import { isPublished } from '../platform/publication-state.js';
import { declaresContentEditor, isRepoPublished, remixModeFor, repoCatalogEntry } from './remix-access.js';

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
 *  - **A remix never publishes.** There is no path from here into the catalog.
 *    The durable exits are a signed share link of *declared parameter values*
 *    and a proposal the game's owner (or the platform) reviews.
 *  - **Params never touch this server.** A slider moves the running game over
 *    the existing `editor:content` bridge, client-side, in under a frame. Only
 *    natural language and code need a round trip, which is why those are the
 *    only edit routes here. Propose receives params/content only to bake them
 *    into the proposal candidate's EDITOR.json defaults.
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
 */

export const REMIX_TTL_MS = 60 * 60_000;
/** Sessions per instance. A remix is small; this is a memory ceiling, not a policy. */
export const MAX_REMIX_SESSIONS = 500;
/** Code edits per session — a bound on spend, and on how far a remix can drift. */
export const MAX_CODE_EDITS = 12;
// Per account per UTC day, persisted: rehydrating cannot reset it.
export const MAX_DAILY_CODE_EDITS = 30;

// Remix had only the global cap; one account drained the day.
export const DEFAULT_DAILY_REMIX_QUOTA = 120;

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
   * What `overrides` looked like before each code edit, newest last.
   *
   * A rebuild that compiles is not a rebuild that plays: the lane's only
   * verification is that the document assembles, and a model can rewrite a
   * render function into valid TypeScript that draws nothing. That happened on
   * the first real remix, and the player had no way back — which turns a toy for
   * exploring a game into one that can wreck it. One step back per edit, bounded
   * by the same ceiling as the edits themselves.
   */
  history: Array<Record<string, string>>;
  /**
   * Successful remix asks this session has already answered (oldest first).
   *
   * Fed into assist/code prompts so "again" / "more" / pronouns resolve against
   * the conversation. Not the undo stack — that is `history` above.
   */
  turns: RemixTurn[];
  /**
   * Whether the game's authoritative copy is the store's. It decides where a
   * rebuild's base comes from: a store game's files replace the ref's entirely,
   * a repo game keeps the ref as its base and carries only the edit.
   */
  fromStore: boolean;
  /** Published version this remix was started from, when the game is store-era. */
  parentVersion?: string;
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
  /**
   * Player UI language (`en` / `pl`) — steers which summary side the model writes carefully.
   * BCP-47-ish only: interpolated into prompts outside the quoted utterance, so it
   * must not carry whitespace, quotes, or newlines a hostile client could smuggle.
   */
  locale: z
    .string()
    .trim()
    .min(2)
    .max(16)
    .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)
    .optional(),
});
const ProposeSchema = z.object({
  title: z.string().trim().min(3, 'title is too short').max(MAX_PROPOSAL_TITLE_LENGTH),
  description: z
    .string()
    .trim()
    .min(MIN_PROPOSAL_DESCRIPTION_LENGTH, 'say a little more about what you changed')
    .max(MAX_PROPOSAL_DESCRIPTION_LENGTH),
  /**
   * Client-held param / paint values: the session never stores them (params ride the
   * bridge; paint is client-only), so propose brings them in to bake into EDITOR.json.
   */
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
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
  /** Tells somebody a proposal moved. Best effort — see ProposalDeps.notify. */
  notifyProposal?: ProposalDeps['notify'];
  // N1: community owns opening a proposal; this route is handed the function.
  openProposal: (deps: ProposalDeps, input: OpenProposalInput) => Promise<OpenProposalResult>;
  /**
   * Starts the gate on a delivered candidate. Shared with the delivery path so a
   * proposal is checked by exactly the machinery a creator's own upload is.
   */
  onSourcesDelivered?: (input: {
    jobId: number;
    slug: string;
    version: string;
    mode?: 'proposal';
  }) => void | Promise<unknown>;
  /**
   * Published sources + base pin for a proposal, both lanes.
   *
   * Same resolver the MCP proposal tools and the review diff use — one answer to
   * "what is this game right now", so a remix propose cannot disagree with either.
   * Absent means catalog (repo-lane) propose stays closed; store-lane still works
   * from the session's own sources.
   */
  resolveProposalBase?: (slug: string) => Promise<{ base: ProposalBase; files: SourceFile[] } | null>;
  store?: Store;
  dailyRemixQuota?: number;
  gamesStore?: GamesStore;
  githubClient?: GitHubClient;
  // The live catalog's repo-lane entry, or null; the same read /api/catalog serves.
  getRepoPublishedCatalogEntry?: (slug: string) => Promise<object | null>;
  /** Ref the repo-published games are served from — the rebuild pins to it. */
  publishedRef?: string;
  assistant?: EditorAssistant;
  codeLane?: VertexCodeLane;
  contentChecker?: ContentChecker;
  /** The platform-wide editing spend breaker — both model lanes ride it. */
  editingGate?: EditingGate;
  // Server secret that signs share codes; absent means share is unavailable.
  submissionTokenSecret?: string;
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
  // Free read before the classifier: a resting platform refuses for nothing.
  async function editHeadroom(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    const dateStr = new Date(now()).toISOString().slice(0, 10);
    if (options.store) {
      const headroom = await peekQuota(
        options.store,
        request.user!.uid,
        dateStr,
        options.dailyRemixQuota ?? Number(process.env.DAILY_REMIX_QUOTA ?? DEFAULT_DAILY_REMIX_QUOTA),
        'remixEdits',
      );
      if (!headroom.allowed) {
        reply.status(429).send({ error: 'daily remix limit reached — the game still plays' });
        return false;
      }
    }
    if (!options.editingGate) return true;
    const gate = await options.editingGate.peek(request.user!.uid, dateStr);
    if (!gate.allowed) {
      reply.status(503).send({ error: 'editing is resting right now — the game still plays' });
      return false;
    }
    return true;
  }

  // One slot used to buy five calls; reconciled after.
  async function spendExtraEditSlots(request: FastifyRequest, extra: number): Promise<void> {
    if (!options.editingGate || extra <= 0) return;
    const dateStr = new Date(now()).toISOString().slice(0, 10);
    for (let index = 0; index < extra; index += 1) {
      await options.editingGate.checkAndSpend(request.user!.uid, dateStr);
    }
  }

  async function spendEditSlot(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    const dateStr = new Date(now()).toISOString().slice(0, 10);
    if (options.store) {
      const quota = await options.store.checkAndIncrementQuota(
        request.user!.uid,
        dateStr,
        options.dailyRemixQuota ?? Number(process.env.DAILY_REMIX_QUOTA ?? DEFAULT_DAILY_REMIX_QUOTA),
        'remixEdits',
      );
      if (!quota.allowed) {
        reply.status(429).send({ error: 'daily remix limit reached — the game still plays' });
        return false;
      }
    }
    if (!options.editingGate) return true;
    const gate = await options.editingGate.checkAndSpend(request.user!.uid, dateStr);
    if (!gate.allowed) {
      reply.status(503).send({ error: 'editing is resting right now — the game still plays' });
      return false;
    }
    return true;
  }

  // Peeks (spend=false) or counts (spend=true) today's persisted code edits.
  async function codeEditAllowance(uid: string, spend: boolean): Promise<boolean> {
    if (!options.store) return true;
    const dateStr = new Date(now()).toISOString().slice(0, 10);
    const verdict = spend
      ? await options.store.checkAndIncrementQuota(uid, dateStr, MAX_DAILY_CODE_EDITS, 'remixCodeEdits')
      : await peekQuota(options.store, uid, dateStr, MAX_DAILY_CODE_EDITS, 'remixCodeEdits');
    return verdict.allowed;
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

  type Taken = { session: RemixSession; rehydrated: boolean } | 'remix_off' | 'not_remixable' | null;

  async function takeSession(request: FastifyRequest): Promise<Taken> {
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
      // Every route reads repo sources after this, so membership is rechecked here.
      if (!session.fromStore && !(await isRepoPublished(options.getRepoPublishedCatalogEntry, session.slug)))
        return null;
      // The author's switch is re-read on every call; off ends the session.
      if ((await remixModeFor(options.store, session.slug)) === 'off') {
        sessions.delete(id);
        return 'remix_off';
      }
      return { session, rehydrated: false };
    }
    const rebuilt = await rehydrate(id, uid);
    return typeof rebuilt === 'string' || rebuilt === null ? rebuilt : { session: rebuilt, rehydrated: true };
  }

  // Replies 404 (gone) or 403 (off / not remixable); null means replied.
  async function requireSession(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{ session: RemixSession; rehydrated: boolean } | null> {
    const found = await takeSession(request);
    if (found === 'remix_off' || found === 'not_remixable') {
      reply.status(403).send({ error: found });
      return null;
    }
    if (!found) {
      reply.status(404).send({ error: 'this remix has expired — start a new one' });
      return null;
    }
    return found;
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
   * what they see is what they had. `codeEdits` restarts at zero, but the
   * persisted daily code-edit cap does not.
   */
  async function rehydrate(id: string, uid: string): Promise<RemixSession | 'remix_off' | 'not_remixable' | null> {
    const claims = readRemixId(id);
    if (!claims || claims.expiresAt <= now()) return null;
    if (claims.uidTag !== ownerTag(uid)) return null;
    if ((await remixModeFor(options.store, claims.slug)) === 'off') return 'remix_off';
    const loaded = await loadSources(claims.slug);
    if (!loaded) return null;
    if (!loaded.remixable) return 'not_remixable';
    const editorJson = loaded.sources[EDITOR_FILE];
    const session: RemixSession = {
      id,
      ownerUid: uid,
      slug: claims.slug,
      ref: loaded.ref,
      sources: loaded.sources,
      fromStore: loaded.fromStore,
      ...(loaded.parentVersion ? { parentVersion: loaded.parentVersion } : {}),
      sourcesLoaded: loaded.fromStore,
      overrides: {},
      history: [],
      turns: [],
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
  async function loadSources(slug: string): Promise<{
    sources: Record<string, string>;
    ref: string;
    fromStore: boolean;
    parentVersion?: string;
    // SPEC declares `editor: content`; nothing else is remixable.
    remixable: boolean;
  } | null> {
    const gamesStore = options.gamesStore;
    const publication = options.store ? await options.store.getPublication(slug) : null;
    if (gamesStore && isPublished(publication)) {
      const manifest = await gamesStore.getManifest(slug, publication.currentVersion);
      if (!manifest) return null;
      const entries = await Promise.all(
        manifest.sourceFiles.map(async (path) => {
          const content = await gamesStore.getSourceFile(slug, publication.currentVersion, path);
          return content === null ? null : ([path, content] as const);
        }),
      );
      const sources = Object.fromEntries(entries.filter((entry): entry is [string, string] => entry !== null));
      return {
        sources,
        ref: manifest.engineRef ?? options.publishedRef ?? 'main',
        fromStore: true,
        parentVersion: publication.currentVersion,
        remixable: declaresContentEditor(null, sources['SPEC.md']),
      };
    }

    if (!options.githubClient || !options.publishedRef) return null;
    const entry = await repoCatalogEntry(options.getRepoPublishedCatalogEntry, slug);
    if (!entry) return null;
    const ref = options.publishedRef;
    // Catalog membership is established before repository existence is probed.
    const manifest = await options.githubClient.getGameFile(ref, slug, 'GAME.json');
    if (manifest === null) return null;
    const [editorJson, editorContentJson] = await Promise.all([
      options.githubClient.getGameFile(ref, slug, EDITOR_FILE),
      options.githubClient.getGameFile(ref, slug, EDITOR_CONTENT_FILE),
    ]);
    // Declaration only: a repo game's code stays on the ref (the assembler reads
    // it there), so the code lane has no file list to map and says so, while the
    // params lane works on exactly the games that declare params.
    const sources: Record<string, string> = {};
    if (editorJson !== null) sources[EDITOR_FILE] = editorJson;
    if (editorContentJson !== null) sources[EDITOR_CONTENT_FILE] = editorContentJson;
    return {
      sources,
      ref,
      fromStore: false,
      remixable: declaresContentEditor(entry, undefined),
    };
  }

  /**
   * The optional GameKit modules a game declares, or none.
   *
   * Read from `GAME.json`, which is the same source the assembler bundles from,
   * so the list the editing call is told matches the list the game actually
   * gets. Any failure here is answered with an empty list: a missing manifest
   * should make the lane more conservative, never crash an edit.
   */
  async function readGameKitModules(client: GitHubClient, ref: string, slug: string): Promise<string[]> {
    try {
      const raw = await client.getGameFile(ref, slug, 'GAME.json');
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      const modules = (parsed as { modules?: unknown } | null)?.modules;
      return Array.isArray(modules) ? modules.filter((name): name is string => typeof name === 'string') : [];
    } catch {
      return [];
    }
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
    return assembleGameHtml(projectFromSources(sources, session.title), { restrictNetwork: true });
  }

  app.post(
    '/api/games/:slug/remix',
    { config: { rateLimit: { max: 20, timeWindow: 60_000 } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const params = StartSchema.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: 'invalid game id' });
      if ((await remixModeFor(options.store, params.data.slug)) === 'off') {
        return reply.status(403).send({ error: 'remix_off' });
      }
      const loaded = await loadSources(params.data.slug);
      if (!loaded) return reply.status(404).send({ error: 'game not found' });
      if (!loaded.remixable) return reply.status(403).send({ error: 'not_remixable' });

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
        ...(loaded.parentVersion ? { parentVersion: loaded.parentVersion } : {}),
        sourcesLoaded: loaded.fromStore,
        overrides: {},
        history: [],
        turns: [],
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
      return reply.send(
        remixClientPayload({
          remixId: id,
          definition,
          contentDefaults: defaultCollections(definition, loaded.sources[EDITOR_CONTENT_FILE]),
          canAssist,
          canCode,
          expiresInMs: REMIX_TTL_MS,
        }),
      );
    },
  );

  app.get('/api/remixes/:id', { config: { rateLimit: { max: 30, timeWindow: 60_000 } } }, async (request, reply) => {
    if (!requireUser(request, reply)) return reply;
    const found = await requireSession(request, reply);
    if (!found) return reply;
    const { session, rehydrated } = found;
    let html: string | null = null;
    if (!rehydrated && Object.keys(session.overrides).length > 0) {
      html = await rebuild(session);
    }
    const canAssist = Boolean(options.assistant && assistEnabled() && session.definition?.params);
    const canCode = Boolean(options.codeLane && codeLaneEnabled());
    return reply.send(
      remixClientPayload({
        remixId: session.id,
        definition: session.definition,
        contentDefaults: defaultCollections(session.definition, session.sources[EDITOR_CONTENT_FILE]),
        canAssist,
        canCode,
        expiresInMs: Math.max(0, session.expiresAt - now()),
        html,
        undoable: !rehydrated && session.history.length > 0,
        turns: rehydrated ? [] : session.turns,
        rehydrated,
      }),
    );
  });

  app.post(
    '/api/remixes/:id/assist',
    { config: { rateLimit: { max: 20, timeWindow: 60_000 } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const session = (await requireSession(request, reply))?.session;
      if (!session) return reply;
      if (!options.assistant || !assistEnabled() || !session.definition?.params) {
        return reply.status(503).send({ error: 'tuning by request is not available here' });
      }
      const body = AssistSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: 'invalid request' });

      if (!(await editHeadroom(request, reply))) return;

      // Anonymous players reach a model here, so the same fail-closed check every
      // other creator-text path uses runs first, before a paid call.
      if (options.contentChecker) {
        const verdict = await options.contentChecker.check(body.data.utterance);
        if (!verdict.allowed) {
          logModerationRejection(request.log, {
            surface: 'remix_assist',
            uid: request.user?.uid,
            category: verdict.category,
            unavailable: verdict.unavailable,
          });
          return replyModerationBlock(reply, verdict, 'that request was rejected');
        }
      }

      if (!(await spendEditSlot(request, reply))) return;

      // Seeded with the declaration's own default collections, not params
      // alone: `applyAssistPatches` validates the whole document, and a game
      // that declares maps would otherwise fail that validation on every
      // request — dropping perfectly good tuning patches into the code lane.
      const content = {
        ...defaultCollections(session.definition, session.sources[EDITOR_CONTENT_FILE]),
        [PARAMS_KEY]: body.data.params ?? {},
      };
      try {
        const result = await options.assistant.assist({
          definition: session.definition,
          content,
          utterance: body.data.utterance,
          game: { title: session.title },
          history: session.turns,
          ...(body.data.locale ? { locale: body.data.locale } : {}),
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
        session.turns = rememberRemixTurn(session.turns, {
          utterance: body.data.utterance,
          ...(result.summary?.en ? { summary: result.summary.en } : {}),
        });
        session.expiresAt = now() + REMIX_TTL_MS;
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
      /**
       * Did the player walk away while we worked?
       *
       * Watched from the first line of the handler, before anything is awaited:
       * a disconnect during moderation or the spend gate would otherwise fire
       * its event before there was a listener, and the run would land anyway.
       *
       * On the *response*, not the request. `request.raw.destroyed` reads as
       * "the client hung up" and is not — Node destroys the request stream once
       * its body has been consumed, which for any request with a JSON payload is
       * always. That check was true on arrival for every real edit, so every
       * finished rebuild was discarded and the route answered 200 with an empty
       * body. `inject()` never reproduced it, because a mock request is never a
       * stream that ends.
       */
      let clientGone = false;
      reply.raw.on('close', () => {
        if (!reply.raw.writableFinished) clientGone = true;
      });
      // Belt as well as braces: a connection that was already gone before this
      // handler ran has no event left to emit, so the state is read directly too.
      const abandoned = () =>
        options.isAbandoned
          ? options.isAbandoned(request)
          : clientGone ||
            ((reply.raw.destroyed || reply.raw.socket?.destroyed === true) && !reply.raw.writableFinished);

      if (!requireUser(request, reply)) return reply;
      const session = (await requireSession(request, reply))?.session;
      if (!session) return reply;
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
      if (session.codeEdits >= MAX_CODE_EDITS || !(await codeEditAllowance(request.user!.uid, false))) {
        return reply.status(429).send({ error: "that's as far as this remix goes — start a new one" });
      }
      const body = AssistSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: 'invalid request' });

      if (!(await editHeadroom(request, reply))) return;

      if (options.contentChecker) {
        const verdict = await options.contentChecker.check(body.data.utterance);
        if (!verdict.allowed) {
          logModerationRejection(request.log, {
            surface: 'remix_code',
            uid: request.user?.uid,
            category: verdict.category,
            unavailable: verdict.unavailable,
          });
          return replyModerationBlock(reply, verdict, 'that request was rejected');
        }
      }

      if (session.codeInFlight) {
        return reply.status(409).send({ error: 'still working on your last change' });
      }
      if (!(await spendEditSlot(request, reply))) return;

      session.codeInFlight = true;
      try {
        const current = { ...session.sources, ...session.overrides };
        // The kit is wanted twice — to show the editing call what `GameKit`
        // actually offers, and to type-check what comes back — so it is fetched
        // once and cached per ref by the client. A ref without one is not fatal:
        // the edit is made with less to go on and the gate stands down.
        const kit = options.githubClient ? await options.githubClient.getGameKitDeclaration(session.ref) : null;
        // Which optional modules this game loads. The kit declaration is the
        // union of all of them, so without this the editing call will happily
        // use a real, correctly-typed API that this particular game does not
        // have — a failure no compiler or type-check can see.
        const modules = options.githubClient
          ? await readGameKitModules(options.githubClient, session.ref, session.slug)
          : [];
        const outcome = await options.codeLane.run(
          {
            slug: session.slug,
            sources: current,
            utterance: body.data.utterance,
            history: session.turns,
            game: { title: session.title },
            ...(body.data.locale ? { locale: body.data.locale } : {}),
            ...(kit ? { kit } : {}),
            modules,
          },
          async (candidate) => {
            // Type-check before building. esbuild only transpiles, so a wrong
            // property name assembles into a perfectly valid document that
            // breaks the game on the first frame — or worse, quietly draws
            // nothing. This is the only step that can see that, and its message
            // is the one a repair round can act on, so it goes first and its
            // errors are what the model is handed.
            const checked = typeCheckGame({ ...current, ...candidate }, kit);
            if (!checked.ok) return checked;
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

        // The flag opens the window; the breaker document closes it. Asymmetric
        // on purpose: opening it is a deploy, because it should be deliberate,
        // and closing it must not wait for one, because until it closes the log
        // is filling with players' own words. Emission is what this gates — the
        // The earlier slot covers one call; the rest land here.
        await spendExtraEditSlots(request, Math.max(0, (outcome.tokens?.calls ?? 1) - 1));

        // lane may still assemble a trace, but nothing leaves the process.
        const tracing = codeLaneDebugEnabled() && !(await options.editingGate?.isTracePaused());
        // request.id is a per-process counter; Cloud Run runs many processes.
        const traceId = randomUUID();
        if (tracing) {
          // Before the success branch, deliberately: a trace that only ever
          // described the runs that worked would be silent on the ones the flag
          // exists to explain.
          request.log.info(
            {
              traceId,
              slug: session.slug,
              utterance: body.data.utterance,
              ok: outcome.ok,
              ...(outcome.ok ? { region: outcome.region } : { reason: outcome.reason, detail: outcome.detail }),
              trace: outcome.trace,
            },
            'remix code lane trace',
          );
        }
        if (!outcome.ok) {
          const summary = safeSummary(outcome.summary);
          return reply.send({
            ok: false,
            reason: outcome.reason,
            ...(tracing && outcome.trace ? { debug: { traceId } } : {}),
            ...(summary ? { summary } : {}),
          });
        }

        // The player sees literals and the summary; neither may echo the source.
        const screened = screenCodeLaneOutput({
          original: current,
          overrides: outcome.overrides,
          ...(kit ? { kit } : {}),
          ...(outcome.summary ? { summary: outcome.summary } : {}),
        });
        if (!screened.ok) {
          request.log.warn({ slug: session.slug, why: screened.why }, 'remix code edit refused by output filter');
          return reply.send({ ok: false, reason: 'refused' });
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

        if (!(await codeEditAllowance(request.user!.uid, true))) {
          return reply.status(429).send({ error: "that's as far as this remix goes — start a new one" });
        }
        session.history.push(session.overrides);
        if (session.history.length > MAX_CODE_EDITS) session.history.shift();
        session.overrides = { ...session.overrides, ...outcome.overrides };
        session.codeEdits += 1;
        session.turns = rememberRemixTurn(session.turns, {
          utterance: body.data.utterance,
          ...(outcome.summary?.en ? { summary: outcome.summary.en } : {}),
        });
        session.expiresAt = now() + REMIX_TTL_MS;
        const html = await rebuild(session);
        if (!html) return reply.status(500).send({ ok: false, reason: 'error' });
        return reply.send({
          ok: true,
          html,
          undoable: true,
          region: outcome.region,
          ...(tracing && outcome.trace ? { debug: { traceId } } : {}),
          ...(outcome.summary ? { summary: outcome.summary } : {}),
        });
      } finally {
        session.codeInFlight = false;
      }
    },
  );

  /**
   * One step back.
   *
   * The code lane verifies that a rebuild *assembles*, which is not the same as
   * verifying that it still plays — a model can turn a render function into
   * valid TypeScript that draws an empty board, and the first real remix did
   * exactly that. Without this the player is left holding a broken game and a
   * composer, which is a worse place than they started.
   *
   * Server-side rather than a client-side swap, because the session is what the
   * *next* edit builds on: restoring the document in the browser while leaving
   * the broken source in the session would quietly compound the damage. The
   * spend is not refunded — the work happened — but `codeEdits` is given back,
   * since a step undone should not also cost a step forward.
   */
  app.post(
    '/api/remixes/:id/undo',
    { config: { rateLimit: { max: 20, timeWindow: 60_000 } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const session = (await requireSession(request, reply))?.session;
      if (!session) return reply;
      const previous = session.history.pop();
      if (previous === undefined) {
        return reply.status(409).send({ error: 'there is nothing to undo', reason: 'nothing_to_undo' });
      }
      const restored = session.overrides;
      session.overrides = previous;
      session.codeEdits = Math.max(0, session.codeEdits - 1);
      // Put it back rather than leaving the session in a state the player cannot
      // see: a failed undo must not silently become a third version, and an
      // assembler that *throws* fails exactly as much as one that returns null.
      let html: string | null = null;
      try {
        html = await rebuild(session);
      } catch (error) {
        request.log.error({ err: error, slug: session.slug }, 'remix undo could not rebuild');
      }
      if (!html) {
        session.overrides = restored;
        session.history.push(previous);
        session.codeEdits += 1;
        return reply.status(503).send({ error: 'could not go back just now', reason: 'rebuild_failed' });
      }
      session.expiresAt = now() + REMIX_TTL_MS;
      return reply.send({ ok: true, html, undoable: session.history.length > 0 });
    },
  );

  /**
   * Turn this remix into a proposal — the contribute-back exit.
   *
   * Remix keeps its share exit and its founding rule: the
   * session itself still never publishes, and nothing here writes to the game being
   * remixed. What it produces is a *proposal* — an immutable candidate version the game's
   * owner (or the platform, for catalog games) is asked about and may refuse. The
   * boundary that moved is "a remix may not ask", not "a remix may publish".
   *
   * Both catalog eras. Store-lane sessions already hold the published sources; repo-lane
   * sessions hold only the declaration (see `loadSources`), so the complete file set and
   * the base pin come from `resolveProposalBase` — the same archive-backed read the MCP
   * proposal tools use. A platform game's proposal is feedback: accept opens no PR.
   */
  app.post(
    '/api/remixes/:id/propose',
    { config: { rateLimit: { max: 5, timeWindow: 60 * 60_000 } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const session = (await requireSession(request, reply))?.session;
      if (!session) return reply;
      if (!options.store || !options.gamesStore) return reply.status(503).send({ error: 'store_unavailable' });

      const body = ProposeSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'invalid request' });
      }

      const params = body.data.params as RemixSaveParams | undefined;
      const content = body.data.content as RemixSaveContent | undefined;
      if (
        !remixHasSavableChange({
          overrides: session.overrides,
          definition: session.definition,
          params,
          content,
        })
      ) {
        return reply.status(409).send({ error: 'no_changes' });
      }

      // Title/description are moderated in openProposal; baked params and paint here.
      const textFields = collectEditorTextFields(session.definition, content, params).map((text) => text.trim());
      if (textFields.length > 0 && options.contentChecker) {
        const verdict = await options.contentChecker.checkFields(textFields);
        if (!verdict.allowed) {
          logModerationRejection(request.log, {
            surface: 'proposal',
            uid: request.user?.uid,
            category: verdict.category,
            unavailable: verdict.unavailable,
          });
          return replyModerationBlock(reply, verdict);
        }
      }

      let base: ProposalBase;
      let baseSources: Record<string, string>;

      if (options.resolveProposalBase) {
        const resolved = await options.resolveProposalBase(session.slug);
        if (!resolved) {
          // Resolver already collapsed every unavailable reason to null (see app.ts).
          // Catalog games without an archive pin, and store games without a live
          // publication, look the same from here: the contribute-back door is shut.
          return reply.status(409).send({ error: 'not_proposable' });
        }
        base = resolved.base;
        baseSources = Object.fromEntries(resolved.files.map((file) => [file.path, file.content]));
      } else if (session.fromStore) {
        // Test / degraded deployments that never wired the shared resolver: the session
        // already holds the store-lane sources, so propose can still work for those.
        const publication = await options.store.getPublication(session.slug);
        if (!isPublished(publication) || !publication.currentVersion) {
          return reply.status(409).send({ error: 'not_published' });
        }
        base = { kind: 'store', version: publication.currentVersion };
        baseSources = session.sources;
      } else {
        return reply.status(409).send({ error: 'not_proposable' });
      }

      // Overrides only on top of the pinned base. Repo-lane `session.sources` starts as
      // EDITOR.json (and may later hold a code-lane map) read from `publishedRef`, which
      // can drift from the snapshot commit the base is pinned to — spreading it here would
      // replace snapshot files and make the candidate disagree with `base`. Code edits
      // land in `overrides`; params/content are baked below.
      const merged = { ...baseSources, ...session.overrides };
      const files = Object.entries(merged).map(([path, fileContent]) => ({ path, content: fileContent }));
      bakeRemixEditorDefaults(files, session.definition, params, content);

      const result = await options.openProposal(
        {
          store: options.store,
          gamesStore: options.gamesStore,
          contentChecker: options.contentChecker,
          log: request.log,
          notify: options.notifyProposal,
          now,
        },
        {
          targetSlug: session.slug,
          proposerUid: request.user!.uid,
          title: body.data.title,
          description: body.data.description,
          base,
          files,
        },
      );
      if (!result.ok) {
        // Moderation refusals carry a category and every other refusal does not, so they
        // are sent apart. Normalized here as well as in the domain layer because the
        // client looks up `errors.contentRejected.<category>`, and JSON drops an
        // undefined value rather than sending null.
        if (isModerationBlock(result.error)) {
          return reply.status(result.status).send({ error: result.error, category: result.category ?? 'other' });
        }
        return reply.status(result.status).send({ error: result.error });
      }

      // The gate runs against the stored candidate exactly as it does for a creator's own
      // delivery. Best effort, like every other gate dispatch: an unstarted gate leaves
      // the proposal `submitted` and re-runnable, which is the safe direction — it cannot
      // reach a reviewer, and it cannot publish.
      if (options.onSourcesDelivered && result.proposal.version) {
        // `PROPOSAL_NO_JOB` because a proposal deliberately has no job — see that
        // constant. The trigger uses the number only to label the build.
        void Promise.resolve(
          options.onSourcesDelivered({
            jobId: PROPOSAL_NO_JOB,
            slug: session.slug,
            version: result.proposal.version,
            mode: 'proposal',
          }),
        ).catch((error: unknown) => request.log.error({ err: error }, 'proposal gate dispatch failed'));
      }

      return reply.send({ proposal: { id: result.proposal.id, state: 'checking' } });
    },
  );

  // Only declared param values travel, signed to the slug; never code.
  app.post(
    '/api/remixes/:id/share',
    { config: { rateLimit: { max: 10, timeWindow: 60_000 } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const session = (await requireSession(request, reply))?.session;
      if (!session) return reply;
      const body = ShareSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: 'invalid request' });
      if (!session.definition?.params) return reply.status(409).send({ error: 'there is nothing to share yet' });
      if (!options.submissionTokenSecret) return reply.status(503).send({ error: 'sharing is not configured' });

      const texts = sharedTexts(session.definition, body.data.params ?? {});
      if (texts.length > 0 && options.contentChecker) {
        const verdict = await options.contentChecker.checkFields(texts);
        if (!verdict.allowed) {
          logModerationRejection(request.log, {
            surface: 'remix_share',
            uid: request.user?.uid,
            category: verdict.category,
            unavailable: verdict.unavailable,
          });
          return replyModerationBlock(reply, verdict, 'that text was rejected');
        }
      }
      // Validated now and on arrival; signed so links cannot be forged.
      const shared = validateSharedParams(session.definition, session.sources, body.data.params ?? {});
      return reply.send({
        code: mintShareCode(shared, session.slug, options.submissionTokenSecret),
        codeEditsExcluded: session.codeEdits > 0,
      });
    },
  );

  registerSharedTuneRoute(app, {
    secret: options.submissionTokenSecret,
    contentChecker: options.contentChecker,
    remixMode: (slug) => remixModeFor(options.store, slug),
    loadDeclaration: async (slug) => {
      const loaded = await loadSources(slug);
      if (!loaded?.remixable) return null;
      const editorJson = loaded.sources[EDITOR_FILE];
      const definition = editorJson ? parseEditorDefinition(editorJson).definition : null;
      return definition ? { definition, sources: loaded.sources } : null;
    },
  });
}
