import { spawnSync } from 'node:child_process';
import { CliError, EXIT_RED } from './exit-codes.js';

export type VerifyStage = 'typecheck' | 'check_static' | 'check_game';

type VerifyRun = (cmd: string, args: string[], cwd: string) => { status: number | null; stderr: string };

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
      return { ok: false, stage: step.stage, detail: result.stderr.slice(0, 500) };
    }
  }
  return { ok: true };
}

export function assertLadderGreen(result: ReturnType<typeof runLadder>): void {
  if (!result.ok) {
    throw new CliError(`verify failed at ${result.stage}`, EXIT_RED, 'hand the failure back to the adapter');
  }
}
