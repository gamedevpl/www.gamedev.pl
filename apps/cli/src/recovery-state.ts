import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deliverySession, type DeliverySession } from './submit-session.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import type { ApiClient } from './api.js';
import type { TreeFile } from './checkout-sync.js';
const marker = (root: string) => join(root, '.gamedev-recovery-ready');
export function markRecoveryReady(
  root: string,
  slug: string,
  session: DeliverySession,
  version: string,
  paths: string[],
): void {
  writeFileSync(marker(root), JSON.stringify({ slug, session, version, paths }), { mode: 0o600 });
}
export function isRecoveryReady(root: string, slug: string): boolean {
  return existsSync(marker(root)) && JSON.parse(readFileSync(marker(root), 'utf8')).slug === slug;
}
export async function guardRecoverySession(api: ApiClient, root: string, slug: string, version: string): Promise<void> {
  const saved = JSON.parse(readFileSync(marker(root), 'utf8'));
  const expected = saved.session;
  if (saved.version !== version)
    throw new CliError('Studio has a newer version since recovery. Review changes before pushing.', EXIT_REFUSED);
  const current = await deliverySession(api, slug);
  if (!current || current.jobId !== expected.jobId || current.generation !== expected.generation)
    throw new CliError('The recovery round changed. Review Studio before pushing.', EXIT_REFUSED);
}
export function clearRecoveryReady(root: string): void {
  rmSync(marker(root), { force: true });
}
export async function matchingStaged(api: ApiClient, slug: string, local: TreeFile[]): Promise<Set<string>> {
  const body = await api.request<{ files?: Array<TreeFile & { stagedBy?: string }> }>(
    'GET',
    `/api/me/studio/games/${slug}/sources`,
  );
  const staged = new Map((body.files ?? []).filter((file) => file.stagedBy).map((file) => [file.path, file.content]));
  return new Set(local.filter((file) => staged.get(file.path) === file.content).map((file) => file.path));
}

export function recoveryPaths(root: string): string[] {
  return JSON.parse(readFileSync(marker(root), 'utf8')).paths;
}
