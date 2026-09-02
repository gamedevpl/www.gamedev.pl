import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { ApiClient } from './api.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';

function defaultRun(cmd: string, args: string[], cwd: string): void {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new CliError(result.stderr || `${cmd} failed`, EXIT_REFUSED);
}

export async function checkoutGame(input: {
  api: ApiClient;
  slug: string;
  dest: string;
  fetchBuffer?: (url: string) => Promise<Buffer>;
  run?: (cmd: string, args: string[], cwd: string) => void;
}): Promise<{ dest: string; remote: string }> {
  const run = input.run ?? defaultRun;
  mkdirSync(input.dest, { recursive: true });
  writeFileSync(join(input.dest, '.gamedev-slug'), input.slug);
  run('git', ['init'], input.dest);
  run('git', ['remote', 'add', 'origin', `gamedev://${input.slug}`], input.dest);
  return { dest: input.dest, remote: `gamedev://${input.slug}` };
}

export function unreconciledMessage(): string {
  return 'working copy is unreconciled with the platform — gamedev pull, or pass --force';
}
