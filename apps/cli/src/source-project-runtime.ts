import { existsSync, lstatSync, readFileSync } from 'node:fs';
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

export function syncSourceRuntime(root: string): string {
  const project = sourceProject(root);
  if (!project) return root;
  const runtime = sourceRuntime(root);
  const files = localGameFiles(root, project.slug);
  for (const file of files) kitPath(root, `src/${file.path}`);
  kitPath(runtime, `games/${project.slug}`);
  for (const file of [...localGameFiles(runtime, project.slug), ...files])
    kitPath(runtime, `games/${project.slug}/${file.path}`);
  writeGameFiles(runtime, project.slug, files);
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
