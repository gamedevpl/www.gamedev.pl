import { existsSync, lstatSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { isDeliverablePath } from '@gamedevpl/contract';
import { join } from 'node:path';
import { localGameFiles, writeGameFiles } from './checkout.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { kitPath } from './kit-install.js';
import { projectRuntimeRoot, sourceProject } from './source-project.js';

export function sourceRuntime(root: string): string {
  const project = sourceProject(root);
  if (!project) return root;
  const runtime = kitPath(root, '.gamedev/local');
  const marker = kitPath(runtime, '.gamedev-slug');
  if (!existsSync(marker) || !lstatSync(marker).isFile() || readFileSync(marker, 'utf8').trim() !== project.slug)
    throw new CliError('The repository runtime is not ready. Run npm run setup, then retry.', EXIT_REFUSED);
  return runtime;
}

function runtimeSourcePaths(runtime: string, slug: string): string[] {
  const prefix = `games/${slug}`;
  const paths: string[] = [];
  const visit = (rel: string) => {
    const directory = kitPath(runtime, rel ? `${prefix}/${rel}` : prefix);
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      kitPath(runtime, `${prefix}/${path}`);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && isDeliverablePath(path)) paths.push(path);
    }
  };
  visit('');
  return paths;
}

export function syncSourceRuntime(root: string): string {
  const project = sourceProject(root);
  if (!project) return root;
  const runtime = sourceRuntime(root);
  const files = localGameFiles(root, project.slug);
  for (const file of files) kitPath(root, `src/${file.path}`);
  const previous = runtimeSourcePaths(runtime, project.slug);
  for (const file of files) kitPath(runtime, `games/${project.slug}/${file.path}`);
  const keep = new Set(files.map((file) => file.path));
  for (const path of previous) if (!keep.has(path)) rmSync(kitPath(runtime, `games/${project.slug}/${path}`));
  writeGameFiles(runtime, project.slug, files, { binaryRasters: true });
  return runtime;
}

export function sourceSetupArgs(root: string): string[] | null {
  if (!sourceProject(root)) return null;
  const packagePath = kitPath(root, 'package.json');
  const pkg = existsSync(packagePath)
    ? (JSON.parse(readFileSync(packagePath, 'utf8')) as { scripts?: Record<string, unknown> })
    : {};
  if (typeof pkg.scripts?.setup !== 'string')
    throw new CliError('This source repository needs an npm setup script to prepare .gamedev/local/.', EXIT_REFUSED);
  return ['run', 'setup'];
}

export function sourceKitRoot(root: string): string {
  const runtime = projectRuntimeRoot(root);
  const installed = join(runtime, 'node_modules/@gamedevpl/gamekit');
  return existsSync(join(installed, 'package.json')) ? installed : runtime;
}
