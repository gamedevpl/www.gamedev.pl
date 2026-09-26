// What the gate build *is*; `gate-trigger.ts` starts it.

import { canonicalAppBaseUrl } from '../platform/canonical-app-url.js';
import { GATE_VERDICT_PATH } from './gate-verdict-routes.js';
import { mintGateVerdictToken } from './gate-verdict-token.js';
import type { GateTriggerOptions } from './gate-trigger.js';

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
 * See `infra/gate-hardening.md`. The image is CONFIG, never input.
 */
export function buildSpec(
  options: Required<Omit<GateTriggerOptions, 'fetchImpl' | 'getAccessToken'>>,
  input: GateTriggerInput,
) {
  const verdictSecret = process.env.SUBMISSION_TOKEN_SECRET?.trim();
  const verdictEndpoint = verdictSecret ? `${canonicalAppBaseUrl()}${GATE_VERDICT_PATH}` : '';
  // Proposal records a gate verdict, like a delivery.
  const verdictKind = input.mode === 'health' ? 'health' : input.mode === 'preview' ? 'preview' : 'gate';
  const verdictToken = verdictSecret ? mintGateVerdictToken(input.slug, input.version, verdictSecret, verdictKind) : '';
  // Single-quoted: input can never break out.
  const gateCommand =
    `npm run gate:run -w @gamedevpl/api -- --slug '${input.slug}' --version '${input.version}'` +
    (input.mode === 'health'
      ? ' --health'
      : input.mode === 'preview'
        ? ' --preview'
        : input.mode === 'proposal'
          ? ' --proposal'
          : '');
  // Forwarded to the step running the gate.
  const gateEnv = [
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
    // Per-run capability: this slug and version only. See gate-hardening.md.
    ...(verdictEndpoint && verdictToken
      ? [`GATE_VERDICT_URL=${verdictEndpoint}`, `GATE_VERDICT_TOKEN=${verdictToken}`]
      : []),
  ];

  // The image already carries everything but the candidate.
  const bakedSteps = [
    {
      id: 'run-gate',
      name: options.runnerImage,
      entrypoint: 'bash',
      secretEnv: ['GAMES_REPO_TOKEN'],
      env: gateEnv,
      args: ['-c', ['set -euo pipefail', 'cd /opt/platform', gateCommand].join('\n')],
    },
  ];

  const fromScratchSteps = [
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
      env: gateEnv,
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
          'npm ci --no-audit --no-fund',
          'npm run build:packages',
          gateCommand,
        ].join('\n'),
      ],
    },
  ];

  return {
    steps: options.runnerImage ? bakedSteps : fromScratchSteps,
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
