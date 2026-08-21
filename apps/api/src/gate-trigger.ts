// Starts the gate when a game is delivered.
//
// This is the link that makes upload delivery actually work. Sources arriving over the
// build channel are stored as an immutable candidate version and are, at that moment,
// unverified — and a version nobody checks is a version nobody can publish. Something
// has to notice the delivery and run the gate against it. This is that something.
//
// It submits a build to Cloud Build directly rather than firing a preconfigured trigger.
// A trigger would be a second place the gate is defined — its steps in
// `cloudbuild-gate.yaml`, its wiring in a console someone clicked once — and the two
// would drift the first time a step changed. Submitting the build inline keeps the whole
// definition in this repository, reviewable in a diff, and means standing up a new
// environment needs no manual console step at all.
//
// Deliberately best effort: a gate that cannot start must not fail the delivery. The
// sources are already stored, the agent has finished its work, and answering it with an
// error would make it upload everything again — storing a duplicate version of a game
// that was received perfectly well. An unstarted gate leaves a candidate sitting
// unverified, which is the safe direction: it cannot publish, and it can be re-run.
// It is logged loudly because "quietly never verified" is the failure worth catching.

import { GoogleAuth } from 'google-auth-library';

export interface GateTriggerOptions {
  /** GCP project that runs the gate builds. */
  project: string;
  /** The games store bucket the gate reads the candidate from. */
  bucket: string;
  /** Platform repo clone URL — the gate runner itself lives there. */
  platformRepo?: string;
  /** Ref of the platform repo to run the gate from. */
  platformRef?: string;
  /** Games repo the harness is cloned from. */
  gamesRepo?: string;
  /** Secret Manager resource holding a contents:read PAT on the games repo. */
  gamesTokenSecret?: string;
  /**
   * Email of the least-privilege SA the build runs as (store write + github-token).
   * Defaults to `gate-runner@${project}.iam.gserviceaccount.com`.
   */
  serviceAccountEmail?: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
}

export interface GateTriggerInput {
  slug: string;
  version: string;
  /**
   * `health` re-runs the check against the current engine and records the verdict as
   * `manifest.health`, leaving the acceptance verdict alone. `preview` runs
   * `check:game --preview` and records `manifest.previewGate` (never publishable).
   * `proposal` runs the full acceptance check with one difference: a behavioural-golden
   * mismatch becomes a finding rather than a refusal, because a proposal that changes how
   * the game plays is supposed to change the golden. Omitted means the acceptance
   * (publish) gate, exactly as before.
   */
  mode?: 'health' | 'preview' | 'proposal';
}

const DEFAULTS = {
  platformRepo: 'https://github.com/gamedevpl/www.gamedev.pl.git',
  platformRef: 'master',
  gamesRepo: 'gamedevpl/www.gamedev.pl-games',
  gamesTokenSecret: 'github-token',
};

/** Hard caps — keep identical to `infra/cloudbuild-gate.yaml`. */
const GATE_MACHINE_TYPE = 'E2_HIGHCPU_8';
const GATE_DISK_SIZE_GB = 50;
const GATE_TIMEOUT = '1800s';

/**
 * The build the gate runs in.
 *
 * Kept in step with `infra/cloudbuild-gate.yaml`, which stays as the hand-runnable
 * version for when someone needs to check one candidate without going through delivery.
 * The reasoning behind the machine type, the timeout and the choice of credential is
 * documented there and applies identically here.
 *
 * Hostile-input invariant: submitted sources must never reshape this CONFIG. Slug and
 * version are data for CLI args only; step images, SA, secrets, and caps stay pinned.
 * See `infra/gate-hardening.md`.
 */
function buildSpec(
  options: Required<Omit<GateTriggerOptions, 'fetchImpl' | 'getAccessToken'>>,
  input: GateTriggerInput,
) {
  return {
    steps: [
      {
        id: 'checkout-platform',
        name: 'gcr.io/cloud-builders/git',
        args: ['clone', '--depth', '1', '--branch', options.platformRef, options.platformRepo, '/workspace/platform'],
      },
      {
        id: 'run-gate',
        name: 'node:22',
        entrypoint: 'bash',
        secretEnv: ['GAMES_REPO_TOKEN'],
        env: [
          `GAMES_STORE_BUCKET=${options.bucket}`,
          `GAMES_REPO=${options.gamesRepo}`,
          'PUPPETEER_SKIP_DOWNLOAD=1',
          // The gate runs in *this* step, not in the API process, so an env var set on
          // the service reaches it only if it is forwarded here. Without this line the
          // preview-stills kill switch is inert in production — set on the service,
          // read by nobody — which is worse than having no switch at all, because it
          // would be believed. Only the disable value travels: it is the sole
          // meaningful setting (anything else means the default, on), and forwarding a
          // literal rather than arbitrary text keeps caller env out of the build config.
          ...(process.env.GATE_PREVIEW_STILLS === '0' ? ['GATE_PREVIEW_STILLS=0'] : []),
        ],
        args: [
          '-c',
          [
            'set -euo pipefail',
            'apt-get update -qq',
            'apt-get install -y -qq --no-install-recommends ffmpeg chromium git ca-certificates',
            // Two separate reasons the harness cannot just be pointed at the browser:
            //
            // 1. Debian's package installs `chromium`, but the capture harness defaults to
            //    spawning `google-chrome` — "a browser is on PATH" is not enough, it has
            //    to be under a name the harness looks for, or capture dies on ENOENT.
            // 2. This step runs as root, and Chrome refuses to start as root without
            //    --no-sandbox. `tools/capture.ts` adds that flag for neither case (its
            //    sibling `tools/shot.ts` does), and it is not overridable by env — so the
            //    browser launched, died instantly, and capture saw ECONNRESET on the CDP
            //    pipe. Fixed here rather than in the games repo on purpose: that file is
            //    hashed whole into `captureSourceHash`, so touching it restages the media
            //    of every published game — a catalog-wide recapture to fix our container.
            'chrome_bin="$(command -v chromium || command -v chromium-browser || command -v google-chrome)"',
            `printf '#!/bin/sh\\nexec "%s" --no-sandbox "$@"\\n' "$chrome_bin" > /usr/local/bin/gate-chrome`,
            'chmod +x /usr/local/bin/gate-chrome',
            'export GAME_CAPTURE_CHROME=/usr/local/bin/gate-chrome',
            'export CHROME_PATH=/usr/local/bin/gate-chrome',
            'cd /workspace/platform',
            'npm ci --no-audit --no-fund && npm run build:packages',
            // Single-quoted so a slug or version can never break out of the command.
            // Both are already validated upstream — the slug against SLUG_PATTERN, the
            // version because we generated it — and this is the belt to that braces.
            // `--health` is our own constant, appended from a two-value union, never
            // from input text.
            `npm run gate:run -w @gamedevpl/api -- --slug '${input.slug}' --version '${input.version}'` +
              (input.mode === 'health'
                ? ' --health'
                : input.mode === 'preview'
                  ? ' --preview'
                  : input.mode === 'proposal'
                    ? ' --proposal'
                    : ''),
          ].join('\n'),
        ],
      },
    ],
    availableSecrets: {
      secretManager: [
        {
          versionName: `projects/${options.project}/secrets/${options.gamesTokenSecret}/versions/latest`,
          env: 'GAMES_REPO_TOKEN',
        },
      ],
    },
    // Least-privilege identity — not the project default Cloud Build SA.
    serviceAccount: `projects/${options.project}/serviceAccounts/${options.serviceAccountEmail}`,
    options: {
      logging: 'CLOUD_LOGGING_ONLY',
      machineType: GATE_MACHINE_TYPE,
      diskSizeGb: GATE_DISK_SIZE_GB,
    },
    timeout: GATE_TIMEOUT,
    // Searchable in the Cloud Build history: "show me every gate run for this game" —
    // and health/preview runs carry their own tag so a fleet re-check reads as one, not as a
    // wave of failing acceptance gates.
    tags: [
      'gate',
      ...(input.mode === 'health' ? ['health'] : []),
      ...(input.mode === 'preview' ? ['preview'] : []),
      ...(input.mode === 'proposal' ? ['proposal'] : []),
      `slug-${input.slug}`,
    ],
  };
}

/**
 * Builds the delivery hook. Returns null when the environment has no gate project
 * configured, so local development and tests get delivery without a build backend
 * rather than an error they cannot act on.
 */
/**
 * What starting a gate produced, for the caller that books what it cost.
 *
 * `buildId` is Cloud Build's own id for the run. It was previously read off the response
 * and dropped, which meant a line on the GCP bill could never be traced back to the game
 * that caused it — the one join a cost report actually needs. Absent when the gate did
 * not start, which is the same thing as "this cost nothing".
 */
export interface GateTriggerResult {
  buildId?: string;
  /**
   * True when Cloud Build accepted the create (HTTP 2xx). May be true without
   * `buildId` when the operation body could not be parsed — the build is still
   * queued in that case; do not treat it as "gate did not start".
   */
  accepted?: boolean;
}

export function createCloudBuildGateTrigger(
  options: GateTriggerOptions | null,
  log?: { error: (details: unknown, message: string) => void; info: (details: unknown, message: string) => void },
): ((input: GateTriggerInput) => Promise<GateTriggerResult>) | undefined {
  if (!options?.project || !options.bucket) return undefined;

  const resolved = {
    project: options.project,
    bucket: options.bucket,
    platformRepo: options.platformRepo ?? DEFAULTS.platformRepo,
    platformRef: options.platformRef ?? DEFAULTS.platformRef,
    gamesRepo: options.gamesRepo ?? DEFAULTS.gamesRepo,
    gamesTokenSecret: options.gamesTokenSecret ?? DEFAULTS.gamesTokenSecret,
    serviceAccountEmail: options.serviceAccountEmail ?? `gate-runner@${options.project}.iam.gserviceaccount.com`,
  };

  const fetchImpl = options.fetchImpl ?? fetch;
  let auth: GoogleAuth | null = null;
  const getAccessToken =
    options.getAccessToken ??
    (async () => {
      auth ??= new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
      const token = await auth.getAccessToken();
      if (!token) throw new Error('could not obtain a Google access token to start the gate');
      return token;
    });

  return async (input: GateTriggerInput): Promise<GateTriggerResult> => {
    try {
      const response = await fetchImpl(`https://cloudbuild.googleapis.com/v1/projects/${resolved.project}/builds`, {
        method: 'POST',
        headers: { authorization: `Bearer ${await getAccessToken()}`, 'content-type': 'application/json' },
        body: JSON.stringify(buildSpec(resolved, input)),
      });
      if (!response.ok) {
        throw new Error(
          `cloud build refused the gate run: ${response.status} ${await response.text().catch(() => '')}`,
        );
      }
      // The create call answers with a long-running operation whose metadata carries the
      // build. Parsed defensively: a shape we did not expect costs us the id, not the
      // gate run — the build is already queued by the time this is read.
      const buildId = await response
        .json()
        .then((body: unknown) => (body as { metadata?: { build?: { id?: string } } })?.metadata?.build?.id)
        .catch(() => undefined);
      log?.info({ slug: input.slug, version: input.version, buildId }, 'gate started');
      // Always mark accepted on 2xx — missing id is a bookkeeping gap, not a failed start.
      return { accepted: true, ...(buildId ? { buildId } : {}) };
    } catch (error) {
      // Loud, because the consequence is silent: the candidate is stored, the agent
      // thinks it is done, and nothing will ever verify it unless someone notices this.
      log?.error({ err: error, slug: input.slug, version: input.version }, 'could not start the gate for a delivery');
      return {};
    }
  };
}

/** Reads the gate configuration from the environment. */
export function gateTriggerOptionsFromEnv(): GateTriggerOptions | null {
  const project = process.env.GATE_BUILD_PROJECT?.trim() || process.env.GOOGLE_CLOUD_PROJECT?.trim();
  const bucket = process.env.GAMES_STORE_BUCKET?.trim();
  if (!project || !bucket) return null;
  return {
    project,
    bucket,
    ...(process.env.GATE_PLATFORM_REPO?.trim() ? { platformRepo: process.env.GATE_PLATFORM_REPO.trim() } : {}),
    ...(process.env.GATE_PLATFORM_REF?.trim() ? { platformRef: process.env.GATE_PLATFORM_REF.trim() } : {}),
    ...(process.env.GAMES_REPO?.trim() ? { gamesRepo: process.env.GAMES_REPO.trim() } : {}),
    ...(process.env.GATE_SERVICE_ACCOUNT?.trim()
      ? { serviceAccountEmail: process.env.GATE_SERVICE_ACCOUNT.trim() }
      : {}),
  };
}
