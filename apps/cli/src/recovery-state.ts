import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deliverySession, type DeliverySession } from './submit-session.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import type { ApiClient } from './api.js';
import type { TreeFile } from './checkout-sync.js';
const marker = (root: string) => join(root, '.gamedev-recovery-ready');
interface RecoveryMarker {
  slug: string;
  session: DeliverySession;
  version: string;
  paths: string[];
  deliveryDigest?: string;
}
function parseMarker(raw: string): RecoveryMarker | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Partial<RecoveryMarker>;
  if (typeof record.slug !== 'string' || typeof record.version !== 'string') return null;
  if (!Array.isArray(record.paths) || record.paths.some((path) => typeof path !== 'string')) return null;
  if (!record.session || typeof record.session !== 'object') return null;
  if (typeof record.session.jobId !== 'number' || typeof record.session.generation !== 'number') return null;
  return record as RecoveryMarker;
}
// Absent means no recovery is pending; unreadable is refused, never silently skipped.
function readMarker(root: string): RecoveryMarker | null {
  const path = marker(root);
  if (!existsSync(path)) return null;
  const record = parseMarker(readFileSync(path, 'utf8'));
  if (!record)
    throw new CliError(
      `Recovery metadata is unreadable: ${path} — local files are unchanged.`,
      EXIT_REFUSED,
      'delete that file to push without resuming the recovery',
    );
  return record;
}
function requireMarker(root: string): RecoveryMarker {
  const record = readMarker(root);
  if (!record) throw new CliError(`Recovery metadata is missing: ${marker(root)}`, EXIT_REFUSED, 'gamedevpl push');
  return record;
}
// Rename so an interrupted write never truncates the marker.
function writeMarker(root: string, record: RecoveryMarker): void {
  const target = marker(root);
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(record), { mode: 0o600 });
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true, recursive: true });
  }
}
export function markRecoveryReady(
  root: string,
  slug: string,
  session: DeliverySession,
  version: string,
  paths: string[],
): void {
  writeMarker(root, { slug, session, version, paths });
}
export function isRecoveryReady(root: string, slug: string): boolean {
  return readMarker(root)?.slug === slug;
}
export async function guardRecoverySession(api: ApiClient, root: string, slug: string, version: string): Promise<void> {
  const saved = requireMarker(root);
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
  const body = await api.request<{ files?: Array<TreeFile & { stagedBy?: string }>; deleted?: string[] }>(
    'GET',
    `/api/me/studio/games/${slug}/sources`,
  );
  const staged = new Map((body.files ?? []).filter((file) => file.stagedBy).map((file) => [file.path, file.content]));
  const localPaths = new Set(local.map((file) => file.path));
  return new Set([
    ...local.filter((file) => staged.get(file.path) === file.content).map((file) => file.path),
    ...(body.deleted ?? []).filter((path) => !localPaths.has(path)),
  ]);
}
export function recoveryPaths(root: string): string[] {
  return requireMarker(root).paths;
}
const treeDigest = (files: TreeFile[]) =>
  createHash('sha256')
    .update(
      JSON.stringify(files.map(({ path, content }) => [path, content]).sort((a, b) => a[0]!.localeCompare(b[0]!))),
    )
    .digest('hex');
export function markRecoveryDelivery(root: string, files: TreeFile[]): void {
  writeMarker(root, { ...requireMarker(root), deliveryDigest: treeDigest(files) });
}
export async function reconcileRecoveryDelivery(
  api: ApiClient,
  root: string,
  slug: string,
  tree: { version: string; files: TreeFile[] },
): Promise<boolean> {
  const saved = requireMarker(root);
  if (saved.version === tree.version || !saved.deliveryDigest || saved.deliveryDigest !== treeDigest(tree.files))
    return false;
  const current = await deliverySession(api, slug);
  if (!current || current.jobId !== saved.session.jobId || current.generation !== saved.session.generation)
    return false;
  return true;
}
