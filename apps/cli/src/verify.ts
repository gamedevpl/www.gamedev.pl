import { spawnCommand } from './delegate.js';
import { spawnSync } from 'node:child_process';
import { CliError, EXIT_RED } from './exit-codes.js';

export type VerifyStage = 'typecheck' | 'check_static' | 'check_game';

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
  const steps: Array<{ stage: VerifyStage; args: string[] }> = [
    { stage: 'typecheck', args: ['run', 'typecheck'] },
    { stage: 'check_static', args: ['run', 'check:static'] },
  ];
  if (input.publish) steps.push({ stage: 'check_game', args: ['run', 'check:game'] });
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
  for (const [stage, script] of [
    ['typecheck', 'typecheck'],
    ['check_static', 'check:static'],
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
