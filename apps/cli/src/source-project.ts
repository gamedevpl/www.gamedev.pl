import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CliError, EXIT_REFUSED } from './exit-codes.js';

function regular(path: string): boolean {
  return existsSync(path) && lstatSync(path).isFile();
}

export function sourceProject(root: string): { slug: string } | null {
  if (!regular(join(root, 'gamedev-kit.json'))) return null;
  const src = join(root, 'src');
  if (!existsSync(src) || !lstatSync(src).isDirectory()) return null;
  const spec = join(src, 'SPEC.md');
  if (!regular(spec)) return null;
  try {
    const pin = JSON.parse(readFileSync(join(root, 'gamedev-kit.json'), 'utf8')) as {
      engineRef?: unknown;
      kitSha256?: unknown;
    };
    if (!/^[a-f0-9]{40}$/.test(String(pin.engineRef)) || !/^[a-f0-9]{64}$/.test(String(pin.kitSha256))) return null;
    const header = readFileSync(spec, 'utf8').match(/^---\s*\n([\s\S]*?)\n---/)?.[1];
    let slug = '';
    for (const line of header?.split(/\r?\n/) ?? []) {
      const colon = line.indexOf(':');
      if (colon !== -1 && line.slice(0, colon).trim() === 'slug')
        slug = line
          .slice(colon + 1)
          .trim()
          .replace(/^["']|["']$/g, '');
    }
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? { slug } : null;
  } catch {
    return null;
  }
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
