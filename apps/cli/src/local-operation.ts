import { isRasterSourcePath } from '@gamedevpl/contract';
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, rmSync } from 'node:fs';
import { z } from 'zod';
import type { ApiClient } from './api.js';
import { hashContent, hashesOf, type TreeFile } from './checkout-sync.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { historyIdentity, installHistorySources, sourceSnapshot } from './history-edit-files.js';
import { localTree, sourcePath } from './history-edit-tree.js';
import { kitPath } from './kit-install.js';
import { hasConflictMarkers, type LocalConflict } from './local-merge.js';
import {
  checkedFiles,
  filesSchema,
  OPERATION_FILE,
  readLocalJson,
  restoreSnapshot,
  snapshotSchema,
  storedSnapshot,
  writeLocalJson,
} from './local-change-store.js';
import { localCheckoutContext, localWorkspace, prepareLocalSources, type LocalWorkspace } from './local-workspace.js';
import { sourceSpecSlug } from './source-project.js';
import { localGameFiles } from './checkout.js';

const schema = z
  .object({
    kind: z.enum(['pull', 'stash']),
    origin: z.string().url(),
    slug: z.string(),
    source: z.string(),
    phase: z.enum(['preparing', 'active', 'committing', 'aborting']),
    before: snapshotSchema,
    base: z.string().max(96_000_000),
    context: z.string().regex(/^[a-f0-9]{64}$/),
    target: filesSchema,
    managed: z.array(z.string()).max(4000),
    version: z.string(),
    conflicts: z
      .array(
        z
          .object({
            paths: z.array(z.string()).min(1).max(4000),
            kind: z.enum(['text', 'binary', 'add-delete', 'structural']),
            resolved: z.boolean(),
            markerDigest: z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .optional(),
          })
          .strict(),
      )
      .max(4000),
    pop: z.string().uuid().optional(),
    finalDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    abortId: z.string().uuid().optional(),
    abortDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export type LocalOperation = z.infer<typeof schema>;

function validateLocalOperation(root: string, value: unknown): LocalOperation {
  const state = schema.parse(value);
  if (state.phase === 'aborting' && (!state.abortId || !state.abortDigest))
    throw new CliError('Invalid interrupted abort journal. Recovery copies were preserved.', EXIT_REFUSED);
  checkedFiles(state.target);
  state.managed.forEach(sourcePath);
  for (const conflict of state.conflicts) conflict.paths.forEach(sourcePath);
  restoreSnapshot(root, state.before);
  return state;
}
function writeOperation(root: string, state: LocalOperation): void {
  validateLocalOperation(root, state);
  writeLocalJson(root, OPERATION_FILE, state);
}
export function readLocalOperation(root: string): LocalOperation | null {
  return existsSync(kitPath(root, OPERATION_FILE))
    ? validateLocalOperation(root, readLocalJson(root, OPERATION_FILE))
    : null;
}
export function operationSummary(root: string) {
  const state = readLocalOperation(root);
  return state
    ? {
        kind: state.kind,
        phase: state.phase,
        conflicts: state.conflicts,
        next:
          state.phase === 'aborting'
            ? 'resolve --abort'
            : state.kind === 'pull'
              ? 'pull --continue / pull --abort'
              : 'stash continue / stash abort',
      }
    : undefined;
}
function checkContext(ws: LocalWorkspace, state: LocalOperation, api: ApiClient) {
  if (
    ws.slug !== state.slug ||
    ws.source !== state.source ||
    api.origin !== state.origin ||
    ws.context !== state.context
  )
    throw new CliError(
      'The checkout identity, ignore rules or platform origin changed during resolution.',
      EXIT_REFUSED,
    );
  const expected = state.kind === 'pull' ? nextBase(ws, state) : state.base;
  if (ws.baseText !== state.base && !(state.phase === 'committing' && ws.baseText === expected))
    throw new CliError(
      'The synchronization base changed during resolution; local sources were preserved.',
      EXIT_REFUSED,
    );
}
function nextBase(ws: LocalWorkspace, state: LocalOperation): string {
  return JSON.stringify({
    version: state.version,
    files: hashesOf(state.target),
    ...(ws.project ? { slug: ws.slug } : {}),
  });
}
export function startLocalOperation(input: {
  ws: LocalWorkspace;
  api: ApiClient;
  kind: LocalOperation['kind'];
  target: TreeFile[];
  result: TreeFile[];
  conflicts: LocalConflict[];
  version: string;
  pop?: string;
}): void {
  const { ws } = input;
  if (existsSync(kitPath(ws.root, OPERATION_FILE)))
    throw new CliError('Resolve or abort the pending merge first.', EXIT_REFUSED);
  const managed = [...new Set([...Object.keys(ws.base.files), ...ws.files.map((f) => f.path)])];
  const result = [...input.result];
  if (
    ws.project &&
    input.conflicts.some((c) => c.paths.includes('SPEC.md')) &&
    sourceSpecSlug(result.find((f) => f.path === 'SPEC.md')?.content ?? '') !== ws.slug
  ) {
    const spec = ws.files.find((f) => f.path === 'SPEC.md');
    const index = result.findIndex((f) => f.path === 'SPEC.md');
    if (index >= 0) result.splice(index, 1);
    if (spec) result.push(spec);
  }
  const after = prepareLocalSources(ws, ws.before, managed, result);
  const state: LocalOperation = {
    kind: input.kind,
    origin: input.api.origin,
    slug: ws.slug,
    source: ws.source,
    phase: 'preparing',
    before: storedSnapshot(ws.before),
    base: ws.baseText,
    context: ws.context,
    target: input.target.map(({ path, content }) => ({ path, content })),
    managed,
    version: input.version,
    conflicts: input.conflicts,
    ...(input.pop ? { pop: input.pop } : {}),
  };
  writeOperation(ws.root, state);
  try {
    installHistorySources({ root: ws.root, source: ws.source, before: ws.before, after, identity: ws.identity });
  } catch (error) {
    if (!existsSync(kitPath(ws.root, '.gamedev/history-pending.json'))) rmSync(kitPath(ws.root, OPERATION_FILE));
    throw error;
  }
  state.phase = 'active';
  writeOperation(ws.root, state);
}

export async function finishLocalOperation(api: ApiClient, root: string, expected?: LocalOperation['kind']) {
  const state = readLocalOperation(root);
  if (!state) throw new CliError('No merge is waiting for resolution.', EXIT_REFUSED);
  if (expected && state.kind !== expected)
    throw new CliError(`The pending operation is ${state.kind}. Use resolve --continue or --abort.`, EXIT_REFUSED);
  const ws = localWorkspace(root);
  checkContext(ws, state, api);
  if (state.phase === 'aborting')
    throw new CliError('Abort is in progress. Run resolve --abort to finish it.', EXIT_REFUSED);
  if (state.phase === 'preparing')
    throw new CliError('Merge setup was interrupted. Run resolve --abort after any history recovery.', EXIT_REFUSED);
  if (state.conflicts.some((c) => !c.resolved))
    throw new CliError('Unresolved paths remain. Run gamedevpl resolve.', EXIT_REFUSED);
  const files = localGameFiles(ws.root, ws.slug);
  prepareLocalSources(ws, ws.before, [...new Set([...state.managed, ...files.map((f) => f.path)])], files);
  if (
    files.some(
      (file) =>
        state.conflicts.some(
          (conflict) =>
            conflict.kind === 'text' &&
            conflict.paths.includes(file.path) &&
            conflict.markerDigest !== hashContent(file.content),
        ) && hasConflictMarkers(file.content),
    )
  )
    throw new CliError('Conflict markers remain in source files.', EXIT_REFUSED);
  if (state.phase === 'committing' && ws.before.digest !== state.finalDigest)
    throw new CliError(
      'Sources changed after merge completion was interrupted; keep the recovery copies.',
      EXIT_REFUSED,
    );
  if (state.kind === 'pull' && state.phase !== 'committing') {
    const latest = await api.request<{ versions: { version: string }[] }>(
      'GET',
      `/api/me/studio/games/${ws.slug}/versions`,
    );
    if (latest.versions[0]?.version !== state.version)
      throw new CliError(
        'The platform moved during resolution. Keep your edits or abort, then pull the new version.',
        EXIT_REFUSED,
      );
  }
  if (historyIdentity(root) !== ws.identity || sourceSnapshot(kitPath(root, ws.source)).digest !== ws.before.digest)
    throw new CliError('Sources or checkout metadata changed while completing the merge. Retry.', EXIT_REFUSED);
  state.phase = 'committing';
  state.finalDigest = ws.before.digest;
  writeOperation(root, state);
  if (state.kind === 'pull') writeLocalJson(root, '.gamedev-base.json', JSON.parse(nextBase(ws, state)));
  if (state.pop) rmSync(kitPath(root, `.gamedev/stashes/${state.pop}.json`), { force: true });
  rmSync(kitPath(root, OPERATION_FILE));
  return { kind: state.kind, completed: true, version: state.version };
}

export function abortLocalOperation(api: ApiClient, root: string, expected?: LocalOperation['kind']) {
  const state = readLocalOperation(root);
  if (!state) {
    const prior = lastAbortResult(api, root, expected);
    if (prior) return prior;
    throw new CliError('No merge is waiting for resolution.', EXIT_REFUSED);
  }
  if (expected && state.kind !== expected)
    throw new CliError(`The pending operation is ${state.kind}. Use resolve --abort.`, EXIT_REFUSED);
  if (state.phase === 'committing')
    throw new CliError('Merge completion started. Use resolve --continue to finish it safely.', EXIT_REFUSED);
  const ws = localWorkspace(root);
  checkContext(ws, state, api);
  if (state.phase !== 'aborting') {
    state.phase = 'aborting';
    state.abortId = randomUUID();
    state.abortDigest = ws.before.digest;
    writeOperation(root, state);
  }
  const backup = kitPath(root, `.gamedev/history-backups/${state.abortId!}`);
  if (existsSync(backup)) {
    if (sourceSnapshot(backup).digest !== state.abortDigest)
      throw new CliError(
        'Abort recovery copy changed. Keep the source and backup copies for manual recovery.',
        EXIT_REFUSED,
      );
  } else {
    const stale = kitPath(root, `.gamedev/history-stage-${state.abortId!}`);
    rmSync(stale, { recursive: true, force: true });
    state.abortDigest = ws.before.digest;
    writeOperation(root, state);
    installHistorySources({
      root,
      source: ws.source,
      before: ws.before,
      after: restoreSnapshot(root, state.before),
      identity: ws.identity,
      id: state.abortId,
    });
  }
  writeLocalJson(root, '.gamedev/last-abort.json', {
    kind: state.kind,
    slug: ws.slug,
    source: ws.source,
    origin: api.origin,
    id: state.abortId,
  });
  rmSync(kitPath(root, OPERATION_FILE));
  return { kind: state.kind, aborted: true, backup };
}

export function lastAbortResult(api: ApiClient, root: string, expected?: LocalOperation['kind']) {
  const path = '.gamedev/last-abort.json';
  if (!existsSync(kitPath(root, path))) return null;
  const record = z
    .object({
      kind: z.enum(['pull', 'stash']),
      slug: z.string(),
      source: z.string(),
      origin: z.string().url(),
      id: z.string().uuid(),
    })
    .strict()
    .parse(readLocalJson(root, path));
  const ws = localCheckoutContext(root);
  if (
    record.slug !== ws.slug ||
    record.source !== ws.source ||
    record.origin !== api.origin ||
    (expected && expected !== record.kind)
  )
    throw new CliError(
      'No matching merge is pending. The last abort belongs to a different operation context.',
      EXIT_REFUSED,
    );
  const backup = kitPath(root, `.gamedev/history-backups/${record.id}`);
  if (!existsSync(backup) || !lstatSync(backup).isDirectory())
    throw new CliError('The last abort recovery copy is missing.', EXIT_REFUSED);
  return { kind: record.kind, aborted: true, backup, replayed: true };
}

export function resolveLocalPath(api: ApiClient, root: string, path: string, choice?: 'ours' | 'theirs' | 'delete') {
  sourcePath(path);
  const state = readLocalOperation(root);
  if (!state || state.phase !== 'active')
    throw new CliError('No active merge is waiting for path resolution.', EXIT_REFUSED);
  const ws = localWorkspace(root);
  checkContext(ws, state, api);
  const conflict = state.conflicts.find((c) => c.paths.includes(path));
  if (!conflict) throw new CliError('That path is not part of this merge’s conflicts.', EXIT_REFUSED);
  if (choice) {
    const files = ws.files.filter((f) => !conflict.paths.includes(f.path));
    if (choice !== 'delete')
      for (const name of conflict.paths) {
        if (choice === 'theirs') {
          const file = state.target.find((f) => f.path === name);
          if (file) files.push(file);
        } else {
          const file = state.before.files.find((f) => f.path === name);
          if (file) {
            const bytes = Buffer.from(file.content, 'base64');
            files.push({
              path: name,
              content: bytes.toString(ws.project && isRasterSourcePath(name) ? 'base64' : 'utf8'),
            });
          }
        }
      }
    const after = prepareLocalSources(
      ws,
      ws.before,
      [...new Set([...state.managed, ...ws.files.map((f) => f.path)])],
      files,
    );
    installHistorySources({ root, source: ws.source, before: ws.before, after, identity: ws.identity });
    if (conflict.kind === 'text')
      conflict.markerDigest = hashContent(files.find((file) => conflict.paths.includes(file.path))?.content ?? '');
  } else {
    const files = localGameFiles(root, ws.slug);
    localTree(files);
    for (const file of files.filter((f) => conflict.paths.includes(f.path)))
      if (conflict.kind === 'text' && hasConflictMarkers(file.content))
        throw new CliError('Remove the conflict markers before marking this path resolved.', EXIT_REFUSED);
    delete conflict.markerDigest;
    if (sourceSnapshot(kitPath(root, ws.source)).digest !== ws.before.digest || historyIdentity(root) !== ws.identity)
      throw new CliError('Sources changed while marking the conflict resolved. Retry.', EXIT_REFUSED);
  }
  conflict.resolved = true;
  writeOperation(root, state);
  return { resolved: conflict.paths, remaining: state.conflicts.filter((c) => !c.resolved).flatMap((c) => c.paths) };
}
