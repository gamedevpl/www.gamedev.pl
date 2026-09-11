import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { BASE_FILE } from './checkout-sync.js';

const ARCHIVE_BYTES = 80 * 1024 * 1024;
const SKIP_SCAFFOLD = new Set(['.git', 'games']);
const LINK_SCAFFOLD = new Set(['node_modules', 'shared']);

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

function copyVerifyScaffold(cwd: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(cwd)) {
    if (SKIP_SCAFFOLD.has(name)) continue;
    const from = join(cwd, name);
    const to = join(dest, name);
    if (LINK_SCAFFOLD.has(name)) {
      symlinkSync(from, to);
      continue;
    }
    cpSync(from, to, { recursive: true });
  }
}

export function materializePushCheckout(input: {
  repo: string;
  srcRef: string;
  slug: string;
  cwd: string;
  dest: string;
}): string {
  copyVerifyScaffold(input.cwd, input.dest);
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
