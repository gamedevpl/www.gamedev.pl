import { projectRuntimeRoot } from './source-project.js';
import { sourceSetupArgs, syncSourceRuntime } from './source-project-runtime.js';
import { childEnv, spawnCommand } from './delegate.js';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CliError, EXIT_RED } from './exit-codes.js';
import { stripTerminalControls } from './ansi.js';
import { readCheckoutSlug } from './checkout.js';

export type VerifyStage = 'typecheck' | 'check_static' | 'check_game';

type VerificationScripts = { typecheck: string; checkStatic: string; checkGame: string };
const LEGACY_SCRIPTS: VerificationScripts = {
  typecheck: 'typecheck',
  checkStatic: 'check:static',
  checkGame: 'check:game',
};

function verificationScripts(cwd: string): VerificationScripts {
  const marker = join(cwd, 'kit.json');
  if (!existsSync(marker)) return LEGACY_SCRIPTS;
  const kit = JSON.parse(readFileSync(marker, 'utf8')) as { cliVerification?: Partial<VerificationScripts> };
  if (!kit.cliVerification) return LEGACY_SCRIPTS;
  return checkedScripts(kit.cliVerification);
}

function checkedScripts(scripts: Partial<VerificationScripts>): VerificationScripts {
  for (const value of [scripts.typecheck, scripts.checkStatic, scripts.checkGame]) {
    if (typeof value !== 'string' || !/^[a-z][a-z0-9:-]*$/.test(value))
      throw new CliError('Invalid Creator Kit verification scripts.', EXIT_RED);
  }
  return scripts as VerificationScripts;
}

function verificationSteps(
  cwd: string,
  publish: boolean,
  slug?: string,
): Array<{ stage: VerifyStage; args: string[] }> {
  const scripts = verificationScripts(cwd);
  const gameSlug = slug ?? readCheckoutSlug(cwd);
  const stages: Array<[VerifyStage, string]> = [
    ['typecheck', scripts.typecheck],
    ['check_static', scripts.checkStatic],
  ];
  if (publish) stages.push(['check_game', scripts.checkGame]);
  return stages.map(([stage, script]) => ({ stage, args: ['run', script, ...(gameSlug ? ['--', gameSlug] : [])] }));
}

export class VerificationError extends CliError {
  readonly stage: VerifyStage;
  readonly detail: string;
  constructor(
    result: { stage: VerifyStage; detail: string },
    cwd: string,
    readonly sourceHash?: string,
    slug?: string,
  ) {
    const scripts = verificationScripts(projectRuntimeRoot(cwd));
    const script = { typecheck: scripts.typecheck, check_static: scripts.checkStatic, check_game: scripts.checkGame }[
      result.stage
    ];
    const detail = stripTerminalControls(result.detail).trim();
    const gameSlug = slug ?? readCheckoutSlug(cwd);
    super(
      `verify failed at ${result.stage}${detail ? '\n' + detail : '\nThe check returned no diagnostics.'}`,
      EXIT_RED,
      `Fix the reported errors, then retry delivery. To inspect this check, run npm run ${script}${gameSlug ? ` -- ${gameSlug}` : ''} in ${projectRuntimeRoot(cwd)}.`,
    );
    this.stage = result.stage;
    this.detail = detail;
  }
}

type VerifyRun = (
  cmd: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
) => { status: number | null; stderr: string; stdout?: string };

function verificationTimeout(stage: VerifyStage): number | undefined {
  if (stage !== 'check_game') return 5 * 60_000;
  const value = process.env.GAMEDEV_CHECK_GAME_TIMEOUT_SECONDS;
  if (value === undefined || value === '0') return;
  const seconds = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(seconds) || seconds <= 0 || seconds * 1000 > 2_147_483_647)
    throw new CliError('GAMEDEV_CHECK_GAME_TIMEOUT_SECONDS must be 0 or a positive integer up to 2147483.', EXIT_RED);
  return seconds * 1000;
}

function timeoutDetail(args: string[], timeoutMs: number | undefined): string {
  return `npm ${args.join(' ')} timed out after ${timeoutMs! / 1000}s.`;
}

export function runLadder(input: {
  cwd: string;
  slug?: string;
  publish: boolean;
  run?: VerifyRun;
  onStage?: (message: string) => void;
}): { ok: true } | { ok: false; stage: VerifyStage; detail: string } {
  const run: VerifyRun = input.run ?? ((cmd, args, cwd, env) => spawnSync(cmd, args, { cwd, env, encoding: 'utf8' }));
  const env = childEnv(process.env, '');
  const setup = sourceSetupArgs(input.cwd);
  if (setup) {
    input.onStage?.('Preparing repository sources for verification');
    const prepared = run('npm', setup, input.cwd, env);
    if (prepared.status !== 0)
      return { ok: false, stage: 'typecheck', detail: [prepared.stderr, prepared.stdout].filter(Boolean).join('\n') };
  }
  const cwd = setup ? syncSourceRuntime(input.cwd) : input.cwd;
  const steps = verificationSteps(cwd, input.publish, input.slug);
  for (const [index, step] of steps.entries()) {
    input.onStage?.(`Checking local game ${index + 1}/${steps.length}: npm ${step.args.join(' ')}`);
    const result = run('npm', step.args, cwd, env);
    if ((result.status ?? 1) !== 0) {
      return {
        ok: false,
        stage: step.stage,
        detail: [result.stderr, result.stdout].filter(Boolean).join('\n').slice(0, 4000),
      };
    }
  }
  return { ok: true };
}

export function assertLadderGreen(
  result: ReturnType<typeof runLadder>,
  cwd = process.cwd(),
  sourceHash?: string,
  slug?: string,
): void {
  if (!result.ok) {
    throw new VerificationError(result, cwd, sourceHash, slug);
  }
}

export async function runLadderAsync(input: {
  cwd: string;
  slug?: string;
  abort: AbortSignal;
  run?: VerifyRun;
  publish?: boolean;
  onStage?: (message: string) => void;
}): Promise<ReturnType<typeof runLadder>> {
  if (input.run) return runLadder({ ...input, publish: input.publish === true });
  if (sourceSetupArgs(input.cwd)) {
    const { prepareWorkspace } = await import('./prepare-workspace.js');
    await prepareWorkspace({ ...input, env: process.env, write: input.onStage ?? (() => {}) });
  }
  const cwd = syncSourceRuntime(input.cwd);
  const env = childEnv(process.env, '');
  const steps = verificationSteps(cwd, input.publish === true, input.slug);
  for (const [index, { stage, args }] of steps.entries()) {
    if (input.abort.aborted) return { ok: false, stage, detail: 'Verification stopped' };
    input.onStage?.(`Checking local game ${index + 1}/${steps.length}: npm ${args.join(' ')}`);
    const timeoutMs = verificationTimeout(stage);
    let timedOut = false;
    const child = spawnCommand({
      command: 'npm',
      args,
      cwd,
      env,
      timeoutMs,
      onTimeout: () => {
        timedOut = true;
      },
      abort: input.abort,
    });
    let detail = '';
    for (const stream of [child.stdout, child.stderr])
      stream?.on('data', (chunk) => {
        detail = (detail + String(chunk)).slice(-16_000);
      });
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    if (timedOut)
      return { ok: false, stage, detail: [timeoutDetail(args, timeoutMs), detail].filter(Boolean).join('\n') };
    if (input.abort.aborted)
      return { ok: false, stage, detail: ['Verification stopped', detail].filter(Boolean).join('\n') };
    if (code !== 0) return { ok: false, stage, detail };
  }
  return { ok: true };
}
