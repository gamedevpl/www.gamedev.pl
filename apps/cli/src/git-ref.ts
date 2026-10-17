import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { BASE_FILE } from './checkout-sync.js';
import { isRasterSourcePath } from '@gamedevpl/contract';
import { checkoutGit, type GitLayout } from './git-checkout-layout.js';

const ARCHIVE_BYTES = 80 * 1024 * 1024;
const SKIP_SCAFFOLD = new Set(['.git', 'games', '.gitignore', '.gamedevplignore']);
const LINK_SCAFFOLD = new Set(['node_modules', 'shared']);

function spawnOrThrow(cmd: string, args: string[], input?: Buffer): Buffer {
  if (cmd === 'git' && args[0] === '-C' && args[1]) return checkoutGit(args[1])(args.slice(2), input);
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

function copyVerifyScaffold(cwd: string, dest: string, sourceRoot: string): void {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(cwd)) {
    if (SKIP_SCAFFOLD.has(name) || name === sourceRoot) continue;
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
  layout?: GitLayout;
}): string {
  const layout = input.layout ?? { root: `games/${input.slug}`, rasters: 'base64' };
  if (![`games/${input.slug}`, 'src'].includes(layout.root))
    throw new CliError('Invalid Git source root.', EXIT_REFUSED);
  const entries = checkoutGit(input.repo)(['ls-tree', '-r', '-z', input.srcRef, '--', layout.root]).toString();
  if (
    entries
      .split('\0')
      .filter(Boolean)
      .some((entry) => !/^(100644|100755) blob /.test(entry))
  )
    throw new CliError('Git sources must be regular files, without symbolic links or submodules.', EXIT_REFUSED);
  copyVerifyScaffold(input.cwd, input.dest, layout.root);
  materializeRootIgnore(input.repo, input.srcRef, input.dest);
  const archive = spawnOrThrow('git', ['-C', input.repo, 'archive', '--format=tar', input.srcRef, '--', layout.root]);
  spawnOrThrow('tar', ['-x', '-C', input.dest], archive);
  if (layout.root !== 'src' && layout.rasters === 'raw') {
    const convert = (root: string, relative = '') => {
      for (const name of readdirSync(root)) {
        const path = join(root, name),
          rel = relative ? `${relative}/${name}` : name,
          stat = lstatSync(path);
        if (stat.isSymbolicLink()) throw new CliError('Git sources must not contain symbolic links.', EXIT_REFUSED);
        if (stat.isDirectory()) convert(path, rel);
        else if (isRasterSourcePath(rel)) {
          const bytes = readFileSync(path),
            text = bytes.toString('utf8').replace(/\s+/g, '');
          const encoded =
            /^[a-zA-Z0-9+/]+={0,2}$/.test(text) && Buffer.from(text, 'base64').toString('base64') === text;
          writeFileSync(path, encoded ? text : bytes.toString('base64'));
        }
      }
    };
    convert(join(input.dest, layout.root));
  }
  const slugFile = join(input.cwd, '.gamedev-slug');
  if (existsSync(slugFile)) copyFileSync(slugFile, join(input.dest, '.gamedev-slug'));
  else writeFileSync(join(input.dest, '.gamedev-slug'), input.slug);
  const base = join(input.cwd, BASE_FILE);
  if (existsSync(base)) copyFileSync(base, join(input.dest, BASE_FILE));
  return input.dest;
}

const ROOT_IGNORE = ['.gitignore', '.gamedevplignore'];

function refHasRegularBlob(repo: string, srcRef: string, path: string): boolean {
  try {
    return /^100\d{3}\s+blob\s+/u.test(checkoutGit(repo)(['ls-tree', srcRef, '--', path]).toString().trim());
  } catch {
    return false;
  }
}

function unlinkCopied(target: string): void {
  try {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink() || stat.isFile()) rmSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
}

function materializeRootIgnore(repo: string, srcRef: string, dest: string): void {
  for (const name of ROOT_IGNORE) {
    const target = join(dest, name);
    unlinkCopied(target);
    if (!refHasRegularBlob(repo, srcRef, name)) continue;
    writeFileSync(target, spawnOrThrow('git', ['-C', repo, 'show', `${srcRef}:${name}`]));
  }
}
