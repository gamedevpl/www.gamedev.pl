import { DELIVERY_FIXED_FILES, isDeliverablePath } from '@gamedevpl/contract';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import type { ApiClient } from './api.js';
import {
  changedPaths,
  fetchLatestTree,
  findCheckout,
  readCheckoutSlug,
  readGameContent,
  writeGameFiles,
} from './checkout.js';
import type { SyncResult, TreeFile } from './checkout-sync.js';
import { CliError, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import { kitPath } from './kit-install.js';
import { gameSourcePath, gameSourceRoot, projectRuntimeRoot, sourceProject } from './source-project.js';

const NON_CODE_FIXED = new Set<string>(DELIVERY_FIXED_FILES.filter((file) => file !== 'game.ts' && file !== 'sim.ts'));

export function parseEntryFlag(raw: string | boolean | undefined): string | undefined {
  if (raw === undefined || raw === false) return undefined;
  const value = raw === true ? 'publish.ts' : raw.trim();
  if (!value || value.includes('/') || value.includes('\\') || value.includes('..') || !value.endsWith('.ts')) {
    throw new CliError(
      `Invalid --entry file "${value}" — expected a top-level .ts file inside the game (e.g. publish.ts).`,
      EXIT_INPUT,
    );
  }
  return value;
}

export function resolvePushTarget(
  requestedArg: string | undefined,
  cwd: string,
  flagSlug: string | null,
): { dest: string; slug: string } | null {
  const target = requestedArg ? resolve(cwd, requestedArg) : cwd;
  const directSlug = readCheckoutSlug(target);
  if (directSlug) {
    return { dest: target, slug: flagSlug ?? directSlug };
  }
  if (flagSlug && existsSync(join(target, 'games', flagSlug, 'SPEC.md'))) {
    return { dest: target, slug: flagSlug };
  }
  const project = sourceProject(target);
  if (project) {
    return { dest: target, slug: flagSlug ?? project.slug };
  }
  const here = findCheckout(target);
  const dest = here?.root ?? target;
  const slug = flagSlug ?? here?.slug ?? readCheckoutSlug(dest);
  return slug ? { dest, slug } : null;
}

function stripComments(source: string): string {
  let out = '';
  let quote = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]!;
    const next = source[i + 1] ?? '';
    if (quote) {
      out += ch;
      if (ch === '\\' && i + 1 < source.length) {
        out += source[++i]!;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 1;
      out += ' ';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    out += ch;
  }
  return out;
}

function extractRelativeSpecifiers(source: string): string[] {
  const clean = stripComments(source);
  const found: string[] = [];
  const patterns = [
    /(?:^|[;\n])\s*(?:import|export)\s+(?:type\s+)?(?:[^'"`;{}]*?(?:\{[^}'"`]*\})?[^'"`;{}]*?)\s+from\s*['"](\.[^'"]+)['"]/g,
    /(?:^|[;\n])\s*import\s+['"](\.[^'"]+)['"]/g,
    /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,
  ];
  for (const regex of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(clean)) !== null) {
      if (match[1]) found.push(match[1]);
    }
  }
  return found;
}

function resolveLocalModule(sourceRoot: string, fromRel: string, specifier: string): string | null {
  const joined = posix.normalize(posix.join(posix.dirname(fromRel), specifier));
  if (joined.startsWith('../') || joined === '..') {
    if (joined.includes('/shared/sim/')) return null;
    throw new CliError(`Import "${specifier}" from ${fromRel} escapes the game directory.`, EXIT_REFUSED);
  }
  const candidates: string[] = [];
  if (/\.(?:mjs|cjs|js)$/.test(joined)) {
    candidates.push(joined.replace(/\.(?:mjs|cjs|js)$/, '.ts'));
  } else if (joined.endsWith('.ts') || joined.endsWith('.json')) {
    candidates.push(joined);
  } else {
    candidates.push(`${joined}.ts`, `${joined}/index.ts`, `${joined}.json`);
  }
  for (const candidate of candidates) {
    const abs = join(sourceRoot, candidate);
    if (existsSync(abs) && lstatSync(abs).isFile()) return candidate;
  }
  throw new CliError(`Module "${specifier}" imported by ${fromRel} was not found.`, EXIT_REFUSED);
}

export function collectReachableModules(sourceRoot: string, entry: string): string[] {
  const entryAbs = join(sourceRoot, entry);
  if (!existsSync(entryAbs) || !lstatSync(entryAbs).isFile()) {
    throw new CliError(`Entry file "${entry}" was not found in ${sourceRoot}.`, EXIT_INPUT);
  }
  const visited = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (!current.endsWith('.ts')) continue;
    const content = readFileSync(join(sourceRoot, current), 'utf8');
    for (const specifier of extractRelativeSpecifiers(content)) {
      const target = resolveLocalModule(sourceRoot, current, specifier);
      if (target && !visited.has(target)) {
        visited.add(target);
        queue.push(target);
      }
    }
  }
  visited.delete(entry);
  return [...visited].sort();
}

function collectOverrideFiles(overrideRoot: string, binaryRasters: boolean): TreeFile[] {
  const files: TreeFile[] = [];
  if (!existsSync(overrideRoot) || !lstatSync(overrideRoot).isDirectory()) return files;
  const visit = (rel: string): void => {
    const dir = rel ? join(overrideRoot, rel) : overrideRoot;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const next = rel ? `${rel}/${entry.name}` : entry.name;
      const abs = join(overrideRoot, next);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(next);
      else if (entry.isFile() && isDeliverablePath(next)) {
        files.push({ path: next, content: readGameContent(abs, next, binaryRasters) });
      }
    }
  };
  visit('');
  return files;
}

export function buildPublishSlice(
  dest: string,
  slug: string,
  entry: string,
): { files: TreeFile[]; entry: string; overrideDir?: string } {
  const sourceRoot = gameSourceRoot(dest, slug);
  const binaryRasters = gameSourcePath(dest, slug) === 'src';
  const reachable = collectReachableModules(sourceRoot, entry);
  const map = new Map<string, TreeFile>();

  for (const fixed of NON_CODE_FIXED) {
    const abs = join(sourceRoot, fixed);
    if (existsSync(abs) && lstatSync(abs).isFile()) {
      map.set(fixed, { path: fixed, content: readGameContent(abs, fixed, binaryRasters) });
    }
  }

  const entryContent = readFileSync(join(sourceRoot, entry), 'utf8');
  map.set('game.ts', { path: 'game.ts', content: entryContent });

  for (const mod of reachable) {
    if (mod === 'game.ts' || mod === entry) continue;
    if (!isDeliverablePath(mod)) continue;
    const abs = join(sourceRoot, mod);
    map.set(mod, { path: mod, content: readGameContent(abs, mod, binaryRasters) });
  }

  const stem = entry.replace(/\.ts$/, '');
  const overrides = stem === 'game' ? [] : collectOverrideFiles(join(sourceRoot, stem), binaryRasters);
  for (const file of overrides) {
    map.set(file.path, file);
  }

  const files = [...map.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, entry, ...(overrides.length > 0 ? { overrideDir: stem } : {}) };
}

export async function inspectPublishSlice(
  api: ApiClient,
  slug: string,
  sliced: TreeFile[],
): Promise<{ sync: SyncResult; tree: { version: string; files: TreeFile[] }; ignored: [] }> {
  const tree = await fetchLatestTree(api, slug);
  const diff = changedPaths(sliced, tree.files);
  const sync: SyncResult =
    diff.length === 0
      ? { kind: 'clean', version: tree.version, local: [], platform: [], conflict: [] }
      : { kind: 'local_only', version: tree.version, local: diff, platform: [], conflict: [] };
  return { sync, tree, ignored: [] };
}

export function stagePublishSlice(dest: string, slug: string, files: TreeFile[]): string {
  const stageRoot = kitPath(dest, '.gamedev/publish-slice');
  rmSync(join(stageRoot, 'games', slug), { recursive: true, force: true });
  mkdirSync(join(stageRoot, 'games', slug), { recursive: true });

  const runtime = projectRuntimeRoot(dest);
  for (const file of ['package.json', 'tsconfig.json', 'kit.json']) {
    const src = join(runtime, file);
    if (existsSync(src) && lstatSync(src).isFile()) {
      copyFileSync(src, join(stageRoot, file));
    }
  }
  for (const dir of ['node_modules', 'shared', 'tools']) {
    const src = join(runtime, dir);
    const dst = join(stageRoot, dir);
    if (!existsSync(src)) continue;
    try {
      if (lstatSync(dst).isSymbolicLink()) unlinkSync(dst);
    } catch {
      // Nothing to clear before symlinking.
    }
    if (!existsSync(dst)) {
      mkdirSync(dirname(dst), { recursive: true });
      symlinkSync(src, dst, 'dir');
    }
  }

  writeGameFiles(stageRoot, slug, files, { binaryRasters: false });
  return stageRoot;
}

export function cleanupPublishSlice(dest: string, slug: string): void {
  rmSync(join(kitPath(dest, '.gamedev/publish-slice'), 'games', slug), { recursive: true, force: true });
}

export function formatDryRunLines(slug: string, files: TreeFile[], entry?: string): string[] {
  const bytes = files.reduce((sum, file) => sum + Buffer.byteLength(file.content, 'utf8'), 0);
  const tag = entry ? ` (entry: ${entry})` : '';
  return [
    `dry-run ${slug}${tag}: ${files.length} file${files.length === 1 ? '' : 's'}, ${(bytes / 1024).toFixed(1)} KB`,
    ...files.map((file) => `  ${file.path}`),
  ];
}
