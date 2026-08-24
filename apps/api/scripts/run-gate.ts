/**
 * Runs the quality gate against one delivered candidate version.
 *
 * This is the step that makes accepting uploads safe. An agent delivers its game's raw
 * sources over the build channel; nothing about that upload is trusted. Here the sources
 * are materialized into a clean games-repo harness at the engine ref the version was
 * built for, the repo's own `check:game` chain is run against them, and the playable
 * bundle plus the capture media are taken from *this* run's output rather than from
 * anything the agent sent.
 *
 * It never publishes. A green verdict makes a version publishable; a human still decides.
 * That ordering is deliberate — human review is the moderation boundary of record, and a
 * gate that published on green would quietly delete it.
 *
 * Why it lives in this repo rather than the games repo: serve-time policy (the restrictive
 * CSP, the AI Act art. 50(2) provenance marking, the credential scan, the byte budget) is
 * owned here, and running the gate here is what keeps it applied by the side that owns it.
 * It also means the games repo never needs GCP credentials — the same reasoning that put
 * the snapshot bake on this side.
 *
 * Environment:
 *   GAMES_STORE_BUCKET   the games store (required)
 *   GAMES_REPO_TOKEN     contents:read PAT on the games repo (or GITHUB_TOKEN)
 *   GAMES_REPO           defaults to gamedevpl/www.gamedev.pl-games
 *
 * Usage:
 *   npm run gate:run -w @gamedevpl/api -- --slug <slug> --version <version>
 *   npm run gate:run -w @gamedevpl/api -- --slug <slug> --version <version> --keep-harness
 *   npm run gate:run -w @gamedevpl/api -- --slug <slug> --version <version> --health
 *
 * `--health` re-runs the same check against the *current* engine (`main`, not the
 * manifest's pin) and records the verdict as `manifest.health` instead of
 * `manifest.gate`. The acceptance verdict is provenance and must survive a red re-run;
 * health is expected to change as the engine moves. A red health run still exits
 * non-zero so the Cloud Build history shows it red.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gateProgressFor, type GateProgressLane, type GateProgressStage } from '../src/delivery/gate-progress.js';
import { runGate } from '../src/delivery/gate-runner.js';
import { createGcsGamesStore } from '../src/delivery/games-store.js';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

/**
 * Streams a child process's output while capturing it.
 *
 * Both, not one: the capture is what goes back to the agent as a failure report, and the
 * stream is what makes a run that hangs diagnosable in Cloud Logging rather than being a
 * silent forty-minute gap.
 */
function run(
  command: string,
  args: string[],
  cwd: string,
  options?: { onChunk?: (text: string) => void },
): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env });
    let output = '';
    const capture = (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
      options?.onChunk?.(text);
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

async function main(): Promise<void> {
  const slug = arg('slug');
  const version = arg('version');
  if (!slug || !version) {
    console.error('usage: gate:run -- --slug <slug> --version <version>');
    process.exit(2);
  }

  const bucket = process.env.GAMES_STORE_BUCKET?.trim();
  if (!bucket) {
    console.error('GAMES_STORE_BUCKET is required');
    process.exit(2);
  }

  const token = (process.env.GAMES_REPO_TOKEN ?? process.env.GITHUB_TOKEN)?.trim();
  if (!token) {
    console.error('GAMES_REPO_TOKEN (or GITHUB_TOKEN) is required to fetch the harness');
    process.exit(2);
  }

  const repo = process.env.GAMES_REPO?.trim() ?? 'gamedevpl/www.gamedev.pl-games';
  const store = createGcsGamesStore({ bucket });
  const harnesses: string[] = [];
  const health = process.argv.includes('--health');
  const preview = process.argv.includes('--preview');
  // The proposal lane: the full acceptance check, except that a behavioural-golden
  // mismatch is recorded as a finding rather than refusing the candidate. See
  // GateRunOptions.proposal for why a proposal needs that and a delivery does not.
  const proposal = process.argv.includes('--proposal');
  if ([health, preview, proposal].filter(Boolean).length > 1) {
    console.error('--health, --preview and --proposal are mutually exclusive');
    process.exit(2);
  }

  const lane: GateProgressLane = health ? 'health' : preview ? 'preview' : proposal ? 'proposal' : 'publish';
  const writeProgress = async (stage: GateProgressStage) => {
    try {
      await store.putGateProgress(slug, version, gateProgressFor(lane, stage));
    } catch (error) {
      console.warn('gate progress write failed', error instanceof Error ? error.message : error);
    }
  };

  const outcome = await runGate(
    slug,
    version,
    {
      store,
      run,
      onProgress: (progress) => store.putGateProgress(slug, version, progress).catch(() => {}),
      async prepareHarness(engineRef) {
        // A real clone rather than the tarball reader the bake uses: the gate has to *run*
        // the repo's toolchain, which means node_modules, the browser and ffmpeg — a
        // read-only file source cannot be npm-installed or executed.
        const dir = await mkdtemp(path.join(tmpdir(), 'gate-harness-'));
        harnesses.push(dir);
        const url = `https://x-access-token:${token}@github.com/${repo}.git`;
        // Shallow and single-branch: the gate needs the tree at one ref, and the history
        // it would otherwise pull is ~200 MB of capture media it will never read.
        const clone = await run('git', ['clone', '--depth', '1', '--branch', engineRef, url, dir], process.cwd());
        if (clone.code !== 0) throw new Error(`could not fetch harness at ${engineRef}`);
        // Drop the PAT from the remote before any agent-authored tree runs: check:game
        // executes under this harness, and `.git/config` would otherwise hand the token
        // to anything that reads the remote URL (hostile-input invariant, BY-11).
        const scrub = await run('git', ['remote', 'set-url', 'origin', `https://github.com/${repo}.git`], dir);
        if (scrub.code !== 0) throw new Error('could not scrub harness git credentials');
        await writeProgress('installing');
        const install = await run('npm', ['ci', '--no-audit', '--no-fund'], dir);
        if (install.code !== 0) throw new Error('harness install failed');
        // Same reason for the process env: spawn inherits it, and check:game must not.
        delete process.env.GAMES_REPO_TOKEN;
        delete process.env.GITHUB_TOKEN;
        return dir;
      },
    },
    // Health asks about today's engine, so the manifest's pin is exactly the thing to
    // ignore. An acceptance run passes nothing and lets the pin (or `main`) decide.
    health ? { engineRef: 'main' } : preview ? { preview: true } : proposal ? { proposal: true } : {},
  );

  if (health) {
    await store.putHealthResult(slug, version, {
      green: outcome.green,
      report: outcome.report,
      engineRef: outcome.engineCommit,
    });
  } else if (preview) {
    // Never putGateResult — preview passes must not look publishable. kit_outdated still
    // rides along so the channel can tell the agent to refresh the kit, not chase smoke.
    await store.putPreviewGateResult(slug, version, {
      green: outcome.green,
      report: outcome.report,
      ...(outcome.status ? { status: outcome.status } : {}),
      // Stills, when the preview run took any — the manifest names the frame so the
      // media read does not have to infer it from a bucket listing.
      ...(outcome.screenshot ? { screenshot: outcome.screenshot } : {}),
    });
  } else {
    // The resolved sha rides along so the manifest ends up pinned to what was actually
    // checked — the first run stamps it, later runs leave the pin alone. screenshot /
    // kit_outdated ride along so the API reconciler can post the frame and surface the
    // status without re-deriving either from the bucket listing.
    await store.putGateResult(slug, version, {
      green: outcome.green,
      report: outcome.report,
      engineRef: outcome.engineCommit,
      ...(outcome.status ? { status: outcome.status } : {}),
      ...(outcome.behaviouralDiff ? { behaviouralDiff: true } : {}),
      ...(outcome.screenshot ? { screenshot: outcome.screenshot } : {}),
      ...(outcome.derivedSourceFiles ? { derivedSourceFiles: outcome.derivedSourceFiles } : {}),
    });
  }

  if (!process.argv.includes('--keep-harness')) {
    await Promise.all(harnesses.map((dir) => rm(dir, { recursive: true, force: true }).catch(() => {})));
  }

  console.log(
    `\n${health ? 'health check' : preview ? 'preview check' : proposal ? 'proposal gate' : 'gate'} ${outcome.green ? 'PASSED' : 'FAILED'} for ${slug}@${version} ` +
      `in ${Math.round(outcome.durationMs / 1000)}s`,
  );
  if (outcome.artifacts.length) console.log(`stored: ${outcome.artifacts.join(', ')}`);
  if (!outcome.green) console.error(outcome.report);

  // Non-zero on a red gate so the job that ran it is visibly red too. A failed gate is a
  // normal outcome for a build, but a gate whose failure nobody notices is not.
  process.exit(outcome.green ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
