// Runs the delivery gate in-process against a local games checkout.

import { spawn } from 'node:child_process';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { GameProject } from '@gamedevpl/contract';
import { createLocalGamesClient } from '../catalog/local-games-repo.js';
import { createHarnessRunner } from '../delivery/gate-sandbox.js';
import { runGate } from '../delivery/gate-runner.js';
import type { GamesStore } from '../delivery/games-store.js';
import type { GateTriggerInput, GateTriggerResult } from '../delivery/gate-trigger.js';
import { assemblePublishedGameHtml, projectFromSources } from '../platform/assemble.js';

export interface LocalGateOptions {
  store: GamesStore;
  // A games-repo checkout with node_modules installed; worktrees are cut from it.
  gamesRepo: string;
  log?: (line: string) => void;
  // Gate runs are Chrome-heavy; more than one at a time starves the box.
  concurrency?: number;
  keepHarness?: boolean;
  // What `main` means here: the commit the local kit was packed from.
  mainRef?: string;
}

export interface LocalGate {
  trigger: (input: GateTriggerInput & { jobId?: number }) => Promise<GateTriggerResult>;
  idle: () => Promise<void>;
}

type RunResult = { code: number; output: string };

function run(
  command: string,
  args: string[],
  cwd: string,
  options?: { onChunk?: (text: string) => void; env?: NodeJS.ProcessEnv; uid?: number; gid?: number },
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: options?.env ?? process.env, uid: options?.uid, gid: options?.gid });
    let output = '';
    const capture = (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      options?.onChunk?.(text);
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

// Same assembly as scripts/run-gate.ts: serve policy, not the repo's dist/.
async function assembleFromHarness(harness: string, slug: string): Promise<string | null> {
  const client = createLocalGamesClient({ rootDir: harness });
  const sources = await client.getGameSources('main', slug, undefined, { entry: 'publish' });
  if (!sources) return null;
  const project: GameProject = projectFromSources(sources, sources.title ?? slug);
  return assemblePublishedGameHtml(project, { restrictNetwork: true });
}

export function createLocalGate(options: LocalGateOptions): LocalGate {
  const log = options.log ?? ((line: string) => console.log(line));
  const limit = Math.max(1, options.concurrency ?? 1);
  const queue: Array<() => Promise<void>> = [];
  const waiters: Array<() => void> = [];
  let active = 0;

  const pump = () => {
    while (active < limit && queue.length) {
      const job = queue.shift()!;
      active++;
      void job().finally(() => {
        active--;
        pump();
        if (active === 0 && queue.length === 0) waiters.splice(0).forEach((resolve) => resolve());
      });
    }
  };

  async function gateOne(input: GateTriggerInput): Promise<void> {
    const { slug, version, mode } = input;
    const lane = mode ?? 'publish';
    const harnesses: string[] = [];
    const started = Date.now();
    log(`[gate] ${slug}@${version} ${lane}: start`);
    try {
      const { runInHarness } = await createHarnessRunner(run, harnesses, { GATE_DELIVERY_SLUG: slug });
      const outcome = await runGate(
        slug,
        version,
        {
          store: options.store,
          run: runInHarness,
          assembleBundle: assembleFromHarness,
          onProgress: (progress) => options.store.putGateProgress(slug, version, progress).catch(() => {}),
          async prepareHarness(engineRef) {
            const dir = await mkdtemp(path.join(tmpdir(), 'staging-gate-'));
            harnesses.push(dir);
            const ref = engineRef === 'main' && options.mainRef ? options.mainRef : engineRef;
            const add = await run('git', ['worktree', 'add', '--detach', dir, ref], options.gamesRepo);
            if (add.code !== 0) throw new Error(`could not cut a worktree at ${engineRef}: ${add.output.trim()}`);
            // Shared, read-only in practice: the gate writes only under games/<slug>/.
            await symlink(path.join(options.gamesRepo, 'node_modules'), path.join(dir, 'node_modules'));
            return dir;
          },
        },
        mode === 'health'
          ? { engineRef: 'main' }
          : mode === 'preview'
            ? { preview: true }
            : mode === 'proposal'
              ? { proposal: true }
              : {},
      );
      if (mode === 'preview') {
        await options.store.putPreviewGateResult(slug, version, {
          green: outcome.green,
          report: outcome.report,
          ...(outcome.status ? { status: outcome.status } : {}),
          ...(outcome.screenshot ? { screenshot: outcome.screenshot } : {}),
        });
      } else if (mode === 'health') {
        await options.store.putHealthResult(slug, version, {
          green: outcome.green,
          report: outcome.report,
          engineRef: outcome.engineCommit,
        });
      } else {
        await options.store.putGateResult(slug, version, {
          green: outcome.green,
          report: outcome.report,
          engineRef: outcome.engineCommit,
          ...(outcome.status ? { status: outcome.status } : {}),
          ...(outcome.behaviouralDiff ? { behaviouralDiff: true } : {}),
          ...(outcome.screenshot ? { screenshot: outcome.screenshot } : {}),
          ...(outcome.derivedSourceFiles ? { derivedSourceFiles: outcome.derivedSourceFiles } : {}),
        });
      }
      const seconds = Math.round((Date.now() - started) / 1000);
      log(`[gate] ${slug}@${version} ${lane}: ${outcome.green ? 'GREEN' : 'RED'} in ${seconds}s`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`[gate] ${slug}@${version} ${lane}: crashed: ${message}`);
      await options.store
        .putGateCrash?.(slug, version, {
          buildId: `local-${slug}-${version}`,
          ranAt: new Date().toISOString(),
          status: 'crashed',
        })
        .catch(() => false);
    } finally {
      if (!options.keepHarness) {
        for (const dir of harnesses) {
          await run('git', ['worktree', 'remove', '--force', dir], options.gamesRepo).catch(() => undefined);
          await rm(dir, { recursive: true, force: true }).catch(() => undefined);
        }
      }
    }
  }

  return {
    async trigger(input) {
      queue.push(() => gateOne(input));
      pump();
      return { accepted: true, buildId: `local-${input.slug}-${input.version}` };
    },
    idle: () =>
      active === 0 && queue.length === 0 ? Promise.resolve() : new Promise((resolve) => waiters.push(resolve)),
  };
}
