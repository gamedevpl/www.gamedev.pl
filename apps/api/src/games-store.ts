// The games store: Cloud Storage as the system of record for creator game content.
//
// Today the games repo is that record, and git is the medium — which is why ~200 MB of
// its history is regenerable PNG and MP4, why a takedown is not complete until a merge
// and a green bake, and why publication means "somebody merged something". None of those
// are properties anyone chose; they are properties of storing content in a repository.
//
// Here a game is a sequence of immutable versions:
//
//   games/<slug>/versions/<version>/manifest.json   provenance: job, engine ref, gate
//   games/<slug>/versions/<version>/source/<path>   SPEC.md, GAME.json, game.ts, …
//   games/<slug>/versions/<version>/media/<file>    produced by our gate, never uploaded
//   games/<slug>/versions/<version>/bundle.html     produced by our gate, never uploaded
//
// Publication is a *registry* fact rather than a storage fact — which object exists says
// nothing about what is live. That split is deliberate: it is what makes a takedown a
// flag flip plus a re-bake instead of a revert-and-wait, and what stops a stray object
// resurrecting a withdrawn game.

import { randomBytes } from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';

/**
 * Files an agent is allowed to deliver, and nothing else.
 *
 * This list is the delivery contract, and it is enforced server-side rather than trusted
 * to the agent's instructions. It is what makes "GameKit and other games are read-only"
 * structurally true instead of merely requested: there is no path an upload can name that
 * reaches `shared/`, `tools/`, or another game's directory, so a prompt-injected or
 * simply confused agent cannot widen its own scope.
 */
export const ALLOWED_SOURCE_FILES = [
  'SPEC.md',
  'GAME.json',
  'CAPTURE.json',
  'ACCEPTANCE.json',
  // The committed behavioural golden. It is not source in the ordinary sense, but the
  // gate replays CAPTURE.json against our engine and diffs the result against this file,
  // so a delivery without it is one the gate cannot check — it fails at the trace stage
  // with `no committed trace`, having proved nothing about the game.
  'TRACE.json',
  // The per-game playtest contract the harness requires of every game (validate Check
  // 26, `tools/lib/playtest-contract.ts`). Same shape of dependency as TRACE.json: a
  // harness-side requirement that only the agent can satisfy, so leaving it off this
  // list does not keep anything out — it makes every delivery unpassable. It did: the
  // check landed in the games repo while this list stayed as it was, and from then on
  // each delivered game reached validate and stopped there, with no gate artifacts and
  // therefore no draft preview for the creator watching.
  'PLAYTEST.json',
  'index.html',
  'game.ts',
  'style.css',
  'sim.ts',
] as const;

/**
 * Additional source files a game may carry beyond the fixed set — its own modules only.
 * Kept narrow on purpose: relative imports inside the game directory are the one thing
 * games legitimately add, and everything else is a smell.
 */
const EXTRA_SOURCE_PATTERN = /^[a-z0-9][a-z0-9/-]{0,60}\.ts$/;

/**
 * First path segments a game may not use.
 *
 * Note these are *not* what confines an upload — that is structural and comes from two
 * other facts: every stored path is prefixed with the version's own `source/`, so no
 * upload can name an object outside the game it belongs to, and `..` is rejected by shape
 * below. A file called `shared/x.ts` would therefore land harmlessly inside the game's
 * own tree.
 *
 * They are rejected anyway because a game directory containing `shared/` or `tools/`
 * reads as though it were editing the harness, and a boundary is only useful if a human
 * reviewing a diff can see it holding. Costing an agent one clear error message is a
 * better trade than a directory listing nobody can interpret at a glance.
 */
const RESERVED_SEGMENTS = new Set(['shared', 'tools', 'games', 'node_modules', 'dist', 'references', 'templates']);

/** Mirrors the games repo's own slug rule, so a name valid here is valid there. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Total bytes one upload may carry. Comfortably above a real game's sources (the largest
 * in the catalog is a few hundred KB of TypeScript) and far below anything that would
 * make a rogue upload interesting as a storage attack.
 */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 64;

export interface SourceFile {
  path: string;
  content: string;
}

export class InvalidUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidUploadError';
  }
}

/**
 * Validates an upload against the delivery contract.
 *
 * Returns the files to store; throws {@link InvalidUploadError} with a message meant for
 * the agent, since the agent is the only one who can fix it and a vague rejection costs a
 * whole session.
 */
export function validateSourceUpload(files: SourceFile[]): SourceFile[] {
  if (files.length === 0) throw new InvalidUploadError('no files in upload');
  if (files.length > MAX_UPLOAD_FILES) {
    throw new InvalidUploadError(`too many files: ${files.length} > ${MAX_UPLOAD_FILES}`);
  }

  const seen = new Set<string>();
  let total = 0;

  for (const file of files) {
    const path = file.path.trim();

    // Traversal is checked before anything else and rejected by shape, not by
    // normalization: `..` never appears in a legitimate game file, so there is no reason
    // to be clever about resolving it.
    if (path.includes('..') || path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
      throw new InvalidUploadError(`illegal path: ${file.path}`);
    }
    if (seen.has(path)) throw new InvalidUploadError(`duplicate path: ${path}`);

    if (path.startsWith('.') || RESERVED_SEGMENTS.has(path.split('/')[0])) {
      throw new InvalidUploadError(
        `path not deliverable: ${path}. \`${path.split('/')[0]}\` belongs to the harness — ` +
          'GameKit, the tooling and other games are read-only context.',
      );
    }

    const allowed =
      (ALLOWED_SOURCE_FILES as readonly string[]).includes(path) ||
      (EXTRA_SOURCE_PATTERN.test(path) && !path.includes('//'));
    if (!allowed) {
      throw new InvalidUploadError(
        `path not deliverable: ${path}. Deliver only your own game's files ` +
          `(${ALLOWED_SOURCE_FILES.join(', ')}, or your own .ts modules).`,
      );
    }

    total += Buffer.byteLength(file.content, 'utf8');
    if (total > MAX_UPLOAD_BYTES) throw new InvalidUploadError(`upload too large: over ${MAX_UPLOAD_BYTES} bytes`);

    seen.add(path);
  }

  if (!seen.has('SPEC.md')) throw new InvalidUploadError('SPEC.md is required — it is the spec of record for the game');
  if (!seen.has('index.html') || !seen.has('game.ts')) {
    throw new InvalidUploadError('index.html and game.ts are required — a game must be playable');
  }
  // Refused here rather than stored and failed later. Without the golden the gate cannot
  // reach a verdict at all — it stops at the trace stage having proved nothing — so
  // accepting the upload would mean storing a version that is dead on arrival, and
  // telling the agent it had succeeded. It is still running at this moment and can
  // record the golden and retry; twenty minutes later it is gone.
  if (!seen.has('TRACE.json')) {
    throw new InvalidUploadError(
      'TRACE.json is required — the gate diffs your game against it and cannot verify a ' +
        'delivery without one. Record it with `npm run trace -- <slug> --accept`, read what ' +
        'it captured, then deliver again.',
    );
  }
  // Same reasoning as TRACE.json, and the same failure without it: the harness's Check
  // 26 refuses a game that does not declare its progress landmarks, so a delivery
  // missing this one is stored, reported as accepted, and then stops at validate having
  // produced no bundle at all. Told now, while the agent still exists to act on it.
  if (!seen.has('PLAYTEST.json')) {
    throw new InvalidUploadError(
      'PLAYTEST.json is required — it declares the progress landmarks your CAPTURE.json ' +
        'run must reach, and the gate refuses a game without one. The minimum is ' +
        '{"expectProgress": ["round-start"]}; list richer landmarks if your capture reaches them.',
    );
  }

  return files.map((file) => ({ path: file.path.trim(), content: file.content }));
}

/** Provenance for one stored version. Answers "where did this come from?" years later. */
export interface VersionManifest {
  slug: string;
  version: string;
  createdAt: string;
  /** The job that produced it. */
  issueNumber: number;
  /** Which backend and model built it — unattributable cost is how budgets get lost. */
  backend?: string;
  model?: string;
  /**
   * The engine commit this version was built and validated against.
   *
   * Pinned rather than floating: a game that passed the gate did so against a specific
   * GameKit, and "it worked when we accepted it" has to remain checkable after the engine
   * moves on.
   */
  engineRef?: string;
  /** Verdict of our own gate. A version without a green one is never publishable. */
  gate?: { green: boolean; ranAt: string; report?: string };
  /**
   * The most recent *health* verdict: the same check re-run later against the current
   * engine, asking "does this game still work on today's GameKit".
   *
   * A separate field from `gate` on purpose. The gate verdict is provenance — "it worked
   * when we accepted it" — and a red health run overwriting it would erase the one fact
   * that justified the publication. Health is the opposite kind of record: always the
   * latest run, expected to change as the engine moves, and never consulted by
   * publishing.
   */
  health?: { green: boolean; ranAt: string; engineRef?: string; report?: string };
  sourceFiles: string[];
}

export type PublicationState = 'published' | 'archived' | 'disabled';

/**
 * One health re-gate of a published game, requested by the operator and resolved by the
 * sweep (the gate runs remotely, writes to the manifest and exits — same read-back
 * pattern as the acceptance verdict, for the same reason).
 *
 * Kept on the publication rather than the job: the job that built this game is terminal
 * and its state machine must stay finished. Health is a property of what is *live*.
 */
export interface PublicationHealthCheck {
  /** The stored version the check ran against — current at request time. */
  version: string;
  requestedAt: string;
  /** Cloud Build's id for the run, when the trigger reported one. */
  buildId?: string;
  /** Set once the sweep reads the verdict off the manifest. */
  green?: boolean;
  verdictAt?: string;
  /** Set once a red verdict has nudged the creator, so sweep re-runs stay quiet. */
  notifiedAt?: string;
}

/**
 * What is live, decided here rather than by what exists in the bucket.
 *
 * Keeping publication out of storage is what makes withdrawal fast and total: a takedown
 * flips this and re-bakes, with no merge, no revert, and no possibility that an object
 * left behind somewhere quietly keeps serving.
 */
export interface PublicationRecord {
  slug: string;
  state: PublicationState;
  currentVersion: string;
  publishedAt: string;
  takedownAt?: string;
  takedownReason?: string;
  /** The latest health re-gate, when one has been requested. See the type's own doc. */
  healthCheck?: PublicationHealthCheck;
}

export interface GamesStore {
  /** Writes a candidate version's sources. Returns the version id assigned. */
  putCandidateSources(input: {
    slug: string;
    issueNumber: number;
    files: SourceFile[];
    backend?: string;
    model?: string;
    engineRef?: string;
  }): Promise<{ version: string; manifest: VersionManifest }>;
  getManifest(slug: string, version: string): Promise<VersionManifest | null>;
  getSourceFile(slug: string, version: string, path: string): Promise<string | null>;
  /**
   * Records our gate's verdict against a version. Only a green one may publish.
   *
   * `engineRef` is the commit the run actually checked against, resolved from the
   * harness itself. Stamped only when the manifest carries none: deliveries do not pin
   * an engine yet, and the gate run is the first moment anything knows the concrete sha
   * a green verdict is reproducible against.
   */
  putGateResult(
    slug: string,
    version: string,
    result: { green: boolean; report?: string; engineRef?: string },
  ): Promise<void>;
  /**
   * Records a *health* verdict — the check re-run against the current engine, long
   * after acceptance. Never touches `gate` or `engineRef`: health answers "does it
   * still work", and must not rewrite the record of what was accepted.
   */
  putHealthResult(
    slug: string,
    version: string,
    result: { green: boolean; report?: string; engineRef?: string },
  ): Promise<void>;
  /** Stores an artifact the gate produced — bundle or media. Agents never write these. */
  putDerivedArtifact(slug: string, version: string, name: string, body: Buffer, contentType: string): Promise<void>;
  getDerivedArtifact(slug: string, version: string, name: string): Promise<Buffer | null>;
}

export interface GcsGamesStoreOptions {
  bucket: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  getAccessToken?: () => Promise<string>;
  /** Injectable so version ids are deterministic under test. */
  versionId?: (at: Date) => string;
}

/**
 * Version ids are timestamps, not counters.
 *
 * A counter needs a read-modify-write against a shared value, which is a race between
 * concurrent builds of the same game and a lock nobody wants to own. A timestamp sorts
 * the same way, needs no coordination, and reads correctly in a bucket listing.
 *
 * It keeps milliseconds and carries a random suffix because seconds are not unique
 * enough to be an identity. Two deliveries inside the same second — a retried upload,
 * or two builds of one game running at once — would otherwise compute the same id and
 * overwrite each other's objects. Versions are supposed to be immutable, and an id that
 * can collide makes them silently not: the loser's sources vanish under the winner's,
 * and the manifest that survives describes a mixture of both. The suffix costs nothing
 * and the timestamp still sorts.
 */
export function defaultVersionId(at: Date): string {
  const stamp = at.toISOString().replace(/[-:.]/g, '');
  return `v${stamp}-${randomBytes(3).toString('hex')}`;
}

function assertSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) throw new InvalidUploadError(`invalid slug: ${slug}`);
}

export function createGcsGamesStore(options: GcsGamesStoreOptions): GamesStore {
  const { bucket } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const versionId = options.versionId ?? defaultVersionId;

  let auth: GoogleAuth | null = null;
  const getAccessToken =
    options.getAccessToken ??
    (async () => {
      auth ??= new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/devstorage.read_write'] });
      const token = await auth.getAccessToken();
      if (!token) throw new Error('could not obtain a Google access token for the games store');
      return token;
    });

  async function readObject(name: string): Promise<Buffer | null> {
    const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(name)}?alt=media`;
    const response = await fetchImpl(url, { headers: { authorization: `Bearer ${await getAccessToken()}` } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`games store read of ${name} failed: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  async function writeObject(name: string, body: Buffer, contentType: string): Promise<void> {
    const url =
      `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o` +
      `?uploadType=media&name=${encodeURIComponent(name)}`;
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await getAccessToken()}`,
        'content-type': contentType,
        // Versions are immutable, so their objects are safe to cache indefinitely —
        // which is what lets a CDN sit in front of this later without a redesign.
        'cache-control': 'public, max-age=31536000, immutable',
      },
      body: new Uint8Array(body),
    });
    if (!response.ok) throw new Error(`games store write of ${name} failed: ${response.status}`);
  }

  const versionPrefix = (slug: string, version: string) => `games/${slug}/versions/${version}`;

  return {
    async putCandidateSources(input) {
      assertSlug(input.slug);
      const files = validateSourceUpload(input.files);
      const at = new Date(now());
      const version = versionId(at);
      const prefix = versionPrefix(input.slug, version);

      await Promise.all(
        files.map((file) =>
          writeObject(`${prefix}/source/${file.path}`, Buffer.from(file.content, 'utf8'), 'text/plain; charset=utf-8'),
        ),
      );

      const manifest: VersionManifest = {
        slug: input.slug,
        version,
        createdAt: at.toISOString(),
        issueNumber: input.issueNumber,
        backend: input.backend,
        model: input.model,
        engineRef: input.engineRef,
        sourceFiles: files.map((file) => file.path),
      };
      // Written last: a manifest is what makes a version real, so a run that dies
      // mid-upload leaves orphaned objects rather than a version claiming files that
      // were never stored.
      await writeObject(`${prefix}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');

      return { version, manifest };
    },

    async getManifest(slug, version) {
      const body = await readObject(`${versionPrefix(slug, version)}/manifest.json`);
      return body ? (JSON.parse(body.toString('utf8')) as VersionManifest) : null;
    },

    async getSourceFile(slug, version, path) {
      const body = await readObject(`${versionPrefix(slug, version)}/source/${path}`);
      return body ? body.toString('utf8') : null;
    },

    async putGateResult(slug, version, result) {
      const prefix = versionPrefix(slug, version);
      const existing = await readObject(`${prefix}/manifest.json`);
      if (!existing) throw new Error(`no manifest for ${slug}@${version}`);
      const manifest = JSON.parse(existing.toString('utf8')) as VersionManifest;
      manifest.gate = { green: result.green, ranAt: new Date(now()).toISOString(), report: result.report };
      // First writer wins: the ref the *first* gate run checked against is the one the
      // verdict is reproducible against, and a re-run must not quietly repin it.
      if (result.engineRef && !manifest.engineRef) manifest.engineRef = result.engineRef;
      await writeObject(`${prefix}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');
    },

    async putHealthResult(slug, version, result) {
      const prefix = versionPrefix(slug, version);
      const existing = await readObject(`${prefix}/manifest.json`);
      if (!existing) throw new Error(`no manifest for ${slug}@${version}`);
      const manifest = JSON.parse(existing.toString('utf8')) as VersionManifest;
      manifest.health = {
        green: result.green,
        ranAt: new Date(now()).toISOString(),
        ...(result.engineRef ? { engineRef: result.engineRef } : {}),
        ...(result.report ? { report: result.report } : {}),
      };
      await writeObject(`${prefix}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');
    },

    async putDerivedArtifact(slug, version, name, body, contentType) {
      await writeObject(`${versionPrefix(slug, version)}/${name}`, body, contentType);
    },

    async getDerivedArtifact(slug, version, name) {
      return readObject(`${versionPrefix(slug, version)}/${name}`);
    },
  };
}
