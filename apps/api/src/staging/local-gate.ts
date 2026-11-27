// Runs the delivery gate in-process against a local games checkout.

import { spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
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
  // Gate runs are Chrome-heavy; parallel runs starve the box.
  concurrency?: number;
  keepHarness?: boolean;
  // What `main` means here: the commit the local kit was packed from.
  mainRef?: string;
  isolation: GateIsolation;
}

export interface LocalGate {
  trigger: (input: GateTriggerInput & { jobId?: number }) => Promise<GateTriggerResult>;
  // Resolves once every gate run queued for this slug has finished.
  settled: (slug: string) => Promise<void>;
}

// How candidate code is kept away from the operator's account.
export type GateIsolation = 'seatbelt' | 'sandbox-user' | 'none';

export function gateIsolation(allowUnsafe: boolean, platform = process.platform): GateIsolation {
  if (process.env.GATE_SANDBOX_USER?.trim()) return 'sandbox-user';
  if (platform === 'darwin') return 'seatbelt';
  if (allowUnsafe) return 'none';
  throw new Error(
    'the local gate runs unreviewed game code: use macOS (sandbox-exec), set GATE_SANDBOX_USER ' +
      '(runner as root), or pass --unsafe-gate on a throwaway machine',
  );
}

const real = (dir: string) => (existsSync(dir) ? realpathSync(dir) : dir);
const quote = (value: string) => JSON.stringify(value);

// Seatbelt: no HOME reads beyond the toolchain; writes to harness and temp.
export function seatbeltProfile(input: {
  harness: string;
  home: string;
  gamesRepo: string;
  nodeDir: string;
  scratch: string;
}): string {
  const home = quote(real(input.home));
  return [
    '(version 1)',
    '(allow default)',
    `(deny file-read* (subpath ${home}))`,
    `(allow file-read* (literal ${home}) (subpath ${quote(real(input.gamesRepo))}) (subpath ${quote(real(input.nodeDir))})`,
    `  (subpath ${quote(real(path.join(input.home, 'Library/Caches/ms-playwright')))}))`,
    '(deny file-write* (subpath "/"))',
    `(allow file-write* (subpath ${quote(real(input.harness))}) (subpath ${quote(real(input.scratch))})`,
    '  (subpath "/dev") (subpath "/private/var/folders") (subpath "/private/tmp"))',
    `(allow file-read* (subpath ${quote(real(input.harness))}) (subpath ${quote(real(input.scratch))}))`,
    '(deny network-outbound (remote ip "*:*"))',
    '(allow network-outbound (remote ip "localhost:*"))',
  ].join('\n');
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

// Same assembly as scripts/run-gate.ts, not the repo's dist/.
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
  const pending = new Map<string, Set<Promise<void>>>();
  let active = 0;

  const pump = () => {
    while (active < limit && queue.length) {
      const job = queue.shift()!;
      active++;
      void job().finally(() => {
        active--;
        pump();
      });
    }
  };

  async function gateOne(input: GateTriggerInput): Promise<void> {
    const { slug, version, mode } = input;
    const lane = mode ?? 'publish';
    const harnesses: string[] = [];
    const started = Date.now();
    let sandbox: Awaited<ReturnType<typeof createHarnessRunner>>['sandbox'] = null;
    log(`[gate] ${slug}@${version} ${lane}: start`);
    try {
      let harnessDir: string | undefined;
      const scratch = await mkdtemp(path.join(tmpdir(), 'staging-gate-home-'));
      harnesses.push(scratch);
      const seatbelt = options.isolation === 'seatbelt';
      const browsers = path.join(homedir(), 'Library/Caches/ms-playwright');
      const runner = await createHarnessRunner(run, harnesses, {
        GATE_DELIVERY_SLUG: slug,
        ...(seatbelt
          ? {
              HOME: scratch,
              GATE_CHROME_NO_SANDBOX: '1',
              ...(existsSync(browsers) ? { PLAYWRIGHT_BROWSERS_PATH: browsers } : {}),
            }
          : {}),
      });
      sandbox = runner.sandbox;
      const inner = runner.runInHarness;
      const runInHarness: typeof inner = seatbelt
        ? (command, args, cwd, runOptions) =>
            inner(
              'sandbox-exec',
              [
                '-p',
                seatbeltProfile({
                  harness: harnessDir ?? cwd,
                  home: homedir(),
                  gamesRepo: options.gamesRepo,
                  nodeDir: path.dirname(path.dirname(process.execPath)),
                  scratch,
                }),
                command,
                ...args,
              ],
              cwd,
              runOptions,
            )
        : inner;
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
            harnessDir = dir;
            const ref = engineRef === 'main' && options.mainRef ? options.mainRef : engineRef;
            const add = await run('git', ['worktree', 'add', '--detach', dir, ref], options.gamesRepo);
            if (add.code !== 0) throw new Error(`could not cut a worktree at ${engineRef}: ${add.output.trim()}`);
            // Shared, read-only in practice: the gate writes only under games/<slug>/.
            await symlink(path.join(options.gamesRepo, 'node_modules'), path.join(dir, 'node_modules'));
            await sandbox?.adopt(dir);
            return dir;
          },
          // Written by this process; the sandbox user must own it.
          afterMaterialize: async (gameDir) => sandbox?.adopt(gameDir),
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
      await sandbox?.dispose().catch(() => undefined);
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
      const done = new Promise<void>((resolve) => queue.push(() => gateOne(input).finally(resolve)));
      const forSlug = pending.get(input.slug) ?? new Set();
      forSlug.add(done);
      pending.set(input.slug, forSlug);
      void done.then(() => forSlug.delete(done));
      pump();
      return { accepted: true, buildId: `local-${input.slug}-${input.version}` };
    },
    async settled(slug) {
      while (pending.get(slug)?.size) await Promise.all(pending.get(slug)!);
    },
  };
}
