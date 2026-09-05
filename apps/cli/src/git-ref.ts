import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { BASE_FILE } from './checkout-sync.js';

const ARCHIVE_BYTES = 80 * 1024 * 1024;

function spawnOrThrow(cmd: string, args: string[], input?: Buffer): Buffer {
  const result = spawnSync(cmd, args, {
    maxBuffer: ARCHIVE_BYTES,
    ...(input ? { input } : {}),
  });
  if (result.status !== 0) {
    const detail = String(result.stderr || `${cmd} failed`);
    throw new CliError(detail.trim() || `${cmd} failed`, EXIT_REFUSED);
  }
  return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? '');
}

export function materializePushCheckout(input: {
  repo: string;
  srcRef: string;
  slug: string;
  cwd: string;
  dest: string;
}): string {
  mkdirSync(input.dest, { recursive: true });
  const archive = spawnOrThrow('git', [
    '-C',
    input.repo,
    'archive',
    '--format=tar',
    input.srcRef,
    '--',
    `games/${input.slug}`,
  ]);
  spawnOrThrow('tar', ['-x', '-C', input.dest], archive);
  const slugFile = join(input.cwd, '.gamedev-slug');
  if (existsSync(slugFile)) copyFileSync(slugFile, join(input.dest, '.gamedev-slug'));
  else writeFileSync(join(input.dest, '.gamedev-slug'), input.slug);
  const base = join(input.cwd, BASE_FILE);
  if (existsSync(base)) copyFileSync(base, join(input.dest, BASE_FILE));
  return input.dest;
}
