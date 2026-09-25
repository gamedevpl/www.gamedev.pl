import { spawnCommand } from './delegate.js';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CliError, EXIT_RED } from './exit-codes.js';

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
  const scripts = kit.cliVerification;
  for (const value of [scripts.typecheck, scripts.checkStatic, scripts.checkGame]) {
    if (typeof value !== 'string' || !/^[a-z][a-z0-9:-]*$/.test(value))
      throw new CliError('Invalid Creator Kit verification scripts.', EXIT_RED);
  }
  return scripts as VerificationScripts;
}

type VerifyRun = (
  cmd: string,
  args: string[],
  cwd: string,
) => { status: number | null; stderr: string; stdout?: string };

export function runLadder(input: {
  cwd: string;
  publish: boolean;
  run?: VerifyRun;
}): { ok: true } | { ok: false; stage: VerifyStage; detail: string } {
  const run: VerifyRun = input.run ?? ((cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: 'utf8' }));
  const scripts = verificationScripts(input.cwd);
  const steps: Array<{ stage: VerifyStage; args: string[] }> = [
    { stage: 'typecheck', args: ['run', scripts.typecheck] },
    { stage: 'check_static', args: ['run', scripts.checkStatic] },
  ];
  if (input.publish) steps.push({ stage: 'check_game', args: ['run', scripts.checkGame] });
  for (const step of steps) {
    const result = run('npm', step.args, input.cwd);
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

export function assertLadderGreen(result: ReturnType<typeof runLadder>): void {
  if (!result.ok) {
    throw new CliError(`verify failed at ${result.stage}`, EXIT_RED, 'hand the failure back to the adapter');
  }
}

export async function runLadderAsync(input: {
  cwd: string;
  abort: AbortSignal;
  run?: VerifyRun;
}): Promise<ReturnType<typeof runLadder>> {
  if (input.run) return runLadder({ ...input, publish: false });
  const scripts = verificationScripts(input.cwd);
  for (const [stage, script] of [
    ['typecheck', scripts.typecheck],
    ['check_static', scripts.checkStatic],
  ] as const) {
    if (input.abort.aborted) return { ok: false, stage, detail: 'Verification stopped' };
    const child = spawnCommand({
      command: 'npm',
      args: ['run', script],
      cwd: input.cwd,
      env: process.env,
      timeoutMs: 5 * 60_000,
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
    if (code !== 0) return { ok: false, stage, detail };
  }
  return { ok: true };
}
