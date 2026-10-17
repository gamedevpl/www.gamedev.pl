import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { kitPath } from './kit-install.js';

function regular(path: string): boolean {
  return existsSync(path) && lstatSync(path).isFile();
}

function present(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function assertSourceIdentity(root: string, slug: string): void {
  for (const rel of ['.gamedev-base.json', '.gamedev/source-slug', '.gamedev/local/.gamedev-slug']) {
    const path = kitPath(root, rel);
    if (!present(path)) continue;
    if (!regular(path)) throw new Error(`Source identity must be a regular file: ${rel}.`);
    const stored = readFileSync(path, 'utf8');
    const bound: unknown = rel === '.gamedev-base.json' ? JSON.parse(stored)?.slug : stored.trim();
    if (bound === undefined) continue;
    if (typeof bound !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(bound))
      throw new Error(`Invalid source identity in ${rel}.`);
    if (bound !== slug)
      throw new Error(`This repository is bound to ${bound}, but SPEC.md selects ${slug}. Restore its original slug.`);
  }
}

export function sourceSpecSlug(content: string): string {
  const header = content.match(/^---\s*\n([\s\S]*?)\n---/)?.[1];
  let slug = '';
  for (const line of header?.split(/\r?\n/) ?? []) {
    const colon = line.indexOf(':');
    if (colon !== -1 && line.slice(0, colon).trim() === 'slug')
      slug = line
        .slice(colon + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
  }
  return slug;
}

export function sourceProject(root: string): { slug: string } | null {
  const pinPath = join(root, 'gamedev-kit.json');
  const src = join(root, 'src');
  const spec = join(src, 'SPEC.md');
  if (
    !present(pinPath) &&
    !present(spec) &&
    !present(join(root, '.gamedev/local/.gamedev-slug')) &&
    !present(join(root, '.gamedev/source-slug'))
  )
    return null;
  try {
    if (!regular(pinPath) || !existsSync(src) || !lstatSync(src).isDirectory() || !regular(spec))
      throw new Error('Source repository paths are missing or not regular files and directories.');
    const pin = JSON.parse(readFileSync(pinPath, 'utf8')) as {
      engineRef?: unknown;
      kitSha256?: unknown;
    };
    if (!/^[a-f0-9]{40}$/.test(String(pin.engineRef)) || !/^[a-f0-9]{64}$/.test(String(pin.kitSha256)))
      throw new Error('The Creator Kit pin is invalid.');
    const slug = sourceSpecSlug(readFileSync(spec, 'utf8'));
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('SPEC.md needs a valid slug.');
    assertSourceIdentity(root, slug);
    return { slug };
  } catch (error) {
    throw new CliError(
      `Invalid source repository metadata: ${error instanceof Error ? error.message : String(error)}`,
      EXIT_REFUSED,
      'Repair gamedev-kit.json and src/SPEC.md, then retry.',
    );
  }
}

export function bindSourceProject(root: string, expectedSlug?: string): { slug: string } | null {
  const project = sourceProject(root);
  if (!project) return null;
  if (expectedSlug && expectedSlug !== project.slug)
    throw new CliError(`This repository contains ${project.slug}, not ${expectedSlug}.`, EXIT_REFUSED);
  const marker = kitPath(root, '.gamedev/source-slug');
  mkdirSync(dirname(marker), { recursive: true });
  try {
    writeFileSync(marker, `${project.slug}\n`, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    sourceProject(root);
  }
  return project;
}

export function gameSourcePath(root: string, slug: string): string {
  const project = sourceProject(root);
  if (project && project.slug !== slug)
    throw new CliError(`This repository contains ${project.slug}, not ${slug}.`, EXIT_REFUSED);
  return project ? 'src' : `games/${slug}`;
}

export function gameSourceRoot(root: string, slug: string): string {
  return join(root, gameSourcePath(root, slug));
}

export function projectRuntimeRoot(root: string): string {
  return sourceProject(root) ? join(root, '.gamedev/local') : root;
}
