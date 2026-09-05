import type { ApiClient } from './api.js';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { inspectGame, localGameFiles, writeBase, fetchLatestTree } from './checkout.js';
import { hashesOf, hashContent, pathInside, syncRefuse, type SyncResult, type TreeFile } from './checkout-sync.js';
import { otherBuilder } from './errors.js';
import { CliError, EXIT_RED, EXIT_REFUSED } from './exit-codes.js';
import { assertLadderGreen, runLadder } from './verify.js';

export type DeliverMode = 'preview' | 'publish';

export type SubmitResult =
  | { kind: 'nothing'; sync: SyncResult }
  | {
      kind: 'delivered';
      sync: SyncResult;
      version: string;
      mode: DeliverMode;
      gateStarted: boolean;
      buildId?: string;
      staged: string[];
      files: TreeFile[];
    };

type StageReply = { accepted?: boolean; error?: string; message?: string };

type DeliverReply = {
  accepted?: boolean;
  version?: string;
  mode?: DeliverMode;
  gateStarted?: boolean;
  buildId?: string;
  rejected?: string;
  error?: string;
  message?: string;
};

async function stagePath(api: ApiClient, slug: string, file: TreeFile): Promise<void> {
  const body = await api.request<StageReply>('PUT', `/api/me/studio/games/${slug}/sources/stage`, {
    path: file.path,
    content: file.content,
  });
  if (body.accepted === false) {
    throw new CliError(body.error ?? body.message ?? 'stage was refused', EXIT_REFUSED);
  }
}

async function deletePath(api: ApiClient, slug: string, path: string): Promise<void> {
  const body = await api.request<StageReply>('POST', `/api/me/studio/games/${slug}/sources/stage/delete`, { path });
  if (body.accepted === false) {
    throw new CliError(body.error ?? body.message ?? 'delete was refused', EXIT_REFUSED);
  }
}

function mapHttpError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/agent_round|actively building/.test(message)) throw otherBuilder('an agent');
  if (/no_active_round|no round open/.test(message)) {
    throw new CliError('no round is open to deliver into — start one from Studio or the REPL', EXIT_REFUSED);
  }
  throw error instanceof CliError ? error : new CliError(message, EXIT_REFUSED);
}

export async function submitGame(input: {
  api: ApiClient;
  slug: string;
  dest: string;
  force?: boolean;
  publish?: boolean;
  run?: Parameters<typeof runLadder>[0]['run'];
}): Promise<SubmitResult> {
  const first = await inspectGame(input);
  if (first.sync.kind === 'clean' && !input.publish && !input.force) {
    return { kind: 'nothing', sync: first.sync };
  }
  if (
    !input.force &&
    (first.sync.kind === 'conflict' || first.sync.kind === 'legacy' || first.sync.kind === 'platform_only')
  ) {
    const refused = syncRefuse(first.sync, 'submit');
    throw new CliError(refused.message, EXIT_REFUSED, refused.next);
  }
  const verify = runLadder({ cwd: input.dest, publish: input.publish === true, run: input.run });
  if (!verify.ok) {
    throw new CliError(`verify failed at ${verify.stage}`, EXIT_RED, 'fix locally, then submit again');
  }
  assertLadderGreen(verify);

  const latest = await inspectGame(input);
  if (!input.force && latest.sync.kind === 'conflict') {
    const refused = syncRefuse(latest.sync, 'submit');
    throw new CliError(`platform changed during verify — ${refused.message}`, EXIT_REFUSED, refused.next);
  }
  if (latest.sync.kind === 'clean' && !input.publish && !input.force) {
    return { kind: 'nothing', sync: latest.sync };
  }
  if (!input.force && latest.sync.kind === 'platform_only') {
    const refused = syncRefuse(latest.sync, 'submit');
    throw new CliError(refused.message, EXIT_REFUSED, refused.next);
  }

  const paths = input.force
    ? changedPathsForced(localGameFiles(input.dest, input.slug), latest.tree.files)
    : latest.sync.local;
  let extra: string[] = [];
  try {
    extra = await extraStagedPaths(input.api, input.slug, paths);
  } catch (error) {
    mapHttpError(error);
  }
  if (extra.length && !input.force) {
    throw new CliError(
      `Studio has unsent staged files (${extra.join(', ')}) — discard them in Studio, or pass --force`,
      EXIT_REFUSED,
    );
  }
  if (extra.length) {
    try {
      await input.api.request('POST', `/api/me/studio/games/${input.slug}/sources/stage/discard`, {});
      extra = await extraStagedPaths(input.api, input.slug, paths);
    } catch (error) {
      mapHttpError(error);
    }
    if (extra.length) {
      throw new CliError(
        `staged files remain after discard (${extra.join(', ')}) — drop them in Studio, then submit`,
        EXIT_REFUSED,
      );
    }
  }
  const uploaded = localGameFiles(input.dest, input.slug);
  const snapshot = hashesOf(uploaded);
  const localMap = new Map(uploaded.map((file) => [file.path, file]));
  const staged: string[] = [];
  try {
    for (const path of paths) {
      const file = localMap.get(path);
      if (file) await stagePath(input.api, input.slug, file);
      else await deletePath(input.api, input.slug, path);
      staged.push(path);
    }
  } catch (error) {
    mapHttpError(error);
  }
  const mode: DeliverMode = input.publish ? 'publish' : 'preview';
  let delivered: DeliverReply;
  try {
    delivered = await input.api.request<DeliverReply>('POST', `/api/me/studio/games/${input.slug}/sources/deliver`, {
      mode,
      attestation: true,
    });
  } catch (error) {
    mapHttpError(error);
  }
  if (!delivered.accepted) {
    throw new CliError(
      delivered.error ?? delivered.message ?? `delivery refused${delivered.rejected ? ` (${delivered.rejected})` : ''}`,
      EXIT_REFUSED,
    );
  }
  const version = delivered.version ?? latest.sync.version;
  let files = uploaded;
  try {
    const tree = await fetchLatestTree(input.api, input.slug);
    mergeDeliveredFiles(input.dest, input.slug, snapshot, tree.files);
    writeBase(input.dest, tree.version, tree.files);
    files = tree.files;
  } catch {
    writeBase(input.dest, version, uploaded);
  }
  return {
    kind: 'delivered',
    sync: latest.sync,
    version,
    mode,
    gateStarted: delivered.gateStarted === true,
    ...(delivered.buildId ? { buildId: delivered.buildId } : {}),
    staged,
    files,
  };
}

function mergeDeliveredFiles(dest: string, slug: string, snapshot: Record<string, string>, fetched: TreeFile[]): void {
  const root = join(dest, 'games', slug);
  for (const file of fetched) {
    const abs = pathInside(root, file.path);
    const now = existsSync(abs) ? hashContent(readFileSync(abs, 'utf8')) : undefined;
    if (now !== snapshot[file.path]) continue;
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, file.content);
  }
}

function extraStagedPaths(api: ApiClient, slug: string, planned: string[]): Promise<string[]> {
  return api
    .request<{ files?: Array<{ path: string; stagedBy?: string }>; deleted?: string[] }>(
      'GET',
      `/api/me/studio/games/${slug}/sources`,
    )
    .then((body) => {
      const overlay = [
        ...(body.files ?? []).filter((file) => file.stagedBy).map((file) => file.path),
        ...(body.deleted ?? []),
      ];
      return [...new Set(overlay)].filter((path) => !planned.includes(path)).sort();
    });
}

function changedPathsForced(local: TreeFile[], remote: TreeFile[]): string[] {
  const names = new Set([...local.map((file) => file.path), ...remote.map((file) => file.path)]);
  const left = new Map(local.map((file) => [file.path, file.content]));
  const right = new Map(remote.map((file) => [file.path, file.content]));
  return [...names].filter((path) => left.get(path) !== right.get(path)).sort();
}

export function formatSubmitLines(result: SubmitResult, slug: string): string[] {
  if (result.kind === 'nothing') {
    return [`nothing to deliver — working copy matches ${result.sync.version}`];
  }
  const lines = [
    `static ladder green`,
    `staged ${result.staged.length} file${result.staged.length === 1 ? '' : 's'}`,
    `delivery accepted ${slug} @ ${result.version} (${result.mode})`,
  ];
  if (result.gateStarted) {
    lines.push(
      result.buildId
        ? `gate started (${result.buildId}) — not published; an operator publishes`
        : 'gate started — not published; an operator publishes',
    );
  } else {
    lines.push('sources accepted but the gate did not start — a preview is not assembling');
  }
  return lines;
}
