import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, rmSync } from 'node:fs';
import { z } from 'zod';
import type { ApiClient } from './api.js';
import { withCheckoutWriter } from './workbench-lock.js';
import { findCheckout } from './checkout.js';
import { hashesOf } from './checkout-sync.js';
import { CliError, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import { historyIdentity, installHistorySources, sourceSnapshot } from './history-edit-files.js';
import { kitPath } from './kit-install.js';
import { checkedFiles, filesSchema, readLocalJson, writeLocalJson } from './local-change-store.js';
import { mergeLocalTrees } from './local-merge.js';
import { abortLocalOperation, finishLocalOperation, startLocalOperation } from './local-operation.js';
import { localWorkspace, prepareLocalSources, workspaceBase } from './local-workspace.js';

const schema = z
  .object({
    id: z.string().uuid(),
    createdAt: z.string().datetime(),
    message: z.string().max(200),
    origin: z.string().url(),
    slug: z.string(),
    source: z.string(),
    version: z.string(),
    base: filesSchema,
    files: filesSchema,
  })
  .strict();
type Stash = z.infer<typeof schema>;
const stashPath = (id: string) => `.gamedev/stashes/${id}.json`;
function readStashes(root: string): Stash[] {
  const dir = kitPath(root, '.gamedev/stashes');
  if (!existsSync(dir)) return [];
  if (!lstatSync(dir).isDirectory()) throw new CliError('Stash storage must be a directory.', EXIT_REFUSED);
  const names = readdirSync(dir).filter((name) => /^[a-f0-9-]{36}\.json$/.test(name));
  if (names.reduce((size, name) => size + lstatSync(kitPath(root, `.gamedev/stashes/${name}`)).size, 0) > 128_000_000)
    throw new CliError('Local stash storage exceeds 128 MB. Archive entries before loading it.', EXIT_REFUSED);
  if (names.length > 200) throw new CliError('Too many local stashes; archive older entries first.', EXIT_REFUSED);
  return names
    .map((name) => {
      const stash = schema.parse(readLocalJson(root, `.gamedev/stashes/${name}`));
      if (name !== stash.id + '.json') throw new CliError('Mismatched stash identity.', EXIT_REFUSED);
      checkedFiles(stash.base);
      checkedFiles(stash.files);
      return stash;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}
function changes(stash: Pick<Stash, 'base' | 'files'>) {
  const base = hashesOf(stash.base),
    files = hashesOf(stash.files);
  return [...new Set([...Object.keys(base), ...Object.keys(files)])]
    .sort()
    .filter((path) => base[path] !== files[path])
    .map((path) => ({ path, kind: !base[path] ? 'added' : !files[path] ? 'deleted' : 'modified' }));
}
const summary = (stash: Stash, index: number) => ({
  id: stash.id,
  ref: `stash@{${index}}`,
  message: stash.message,
  createdAt: stash.createdAt,
  version: stash.version,
  changes: changes(stash),
});

async function stashUnlocked(input: {
  api: ApiClient;
  cwd: string;
  args: string[];
  flags: Record<string, string | boolean>;
}) {
  const { api, flags } = input,
    [action = 'push', selected, ...extra] = input.args,
    ws = localWorkspace(input.cwd);
  if (
    extra.length ||
    Object.keys(flags).some((key) => !['json', 'message'].includes(key)) ||
    (flags.message !== undefined && (typeof flags.message !== 'string' || flags.message.length > 200)) ||
    (flags.message !== undefined && action !== 'push')
  )
    throw new CliError('usage: stash [push --message <text>|list|show|apply|pop|drop [id]|continue|abort]', EXIT_INPUT);
  if (['continue', 'abort'].includes(action)) {
    if (selected) throw new CliError('Stash completion takes no id.', EXIT_INPUT);
    return action === 'continue'
      ? finishLocalOperation(api, ws.root, 'stash')
      : abortLocalOperation(api, ws.root, 'stash');
  }
  const stashes = readStashes(ws.root);
  if (action === 'list') {
    if (selected) throw new CliError('stash list takes no id.', EXIT_INPUT);
    return { stashes: stashes.map(summary) };
  }
  if (action === 'push') {
    if (selected) throw new CliError('Use --message for a stash description.', EXIT_INPUT);
    const base = await workspaceBase(api, ws),
      modified = changes({ base, files: ws.files });
    if (!modified.length) return { saved: false, message: 'No local source changes to stash.' };
    if (stashes.length >= 200) throw new CliError('Drop an old stash before creating another.', EXIT_REFUSED);
    const after = prepareLocalSources(
      ws,
      ws.before,
      [...new Set([...Object.keys(ws.base.files), ...ws.files.map((f) => f.path)])],
      ws.project && ws.base.version === 'undelivered' && !base.length
        ? ws.files.filter((file) => file.path === 'SPEC.md')
        : base,
    );
    if (
      historyIdentity(ws.root) !== ws.identity ||
      sourceSnapshot(kitPath(ws.root, ws.source)).digest !== ws.before.digest
    )
      throw new CliError('Sources changed while preparing the stash. Retry after reviewing them.', EXIT_REFUSED);
    const stash: Stash = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      message: typeof flags.message === 'string' ? flags.message : 'Local draft',
      origin: api.origin,
      slug: ws.slug,
      source: ws.source,
      version: ws.base.version,
      base,
      files: ws.files,
    };
    if ([...stashes, stash].reduce((size, row) => size + Buffer.byteLength(JSON.stringify(row)), 0) > 128_000_000)
      throw new CliError('Local stash storage would exceed 128 MB. Drop an old entry first.', EXIT_REFUSED);
    writeLocalJson(ws.root, stashPath(stash.id), stash);
    const backup = installHistorySources({
      root: ws.root,
      source: ws.source,
      before: ws.before,
      after,
      identity: ws.identity,
    });
    return { saved: true, stash: summary(stash, 0), backup };
  }
  if (!['show', 'apply', 'pop', 'drop'].includes(action)) throw new CliError('Unknown stash command.', EXIT_INPUT);
  const ref = selected ?? '0',
    index = /^(?:\d+|stash@\{\d+\})$/.test(ref) ? Number(ref.replace(/\D/g, '')) : -1,
    stash = index >= 0 ? stashes[index] : stashes.find((row) => row.id === ref);
  if (!stash) throw new CliError('Local stash not found. Run gamedevpl stash list.', EXIT_REFUSED);
  if (stash.slug !== ws.slug || stash.source !== ws.source || stash.origin !== api.origin)
    throw new CliError('The stash belongs to another game, source layout or platform origin.', EXIT_REFUSED);
  if (action === 'show') return { stash: summary(stash, stashes.indexOf(stash)) };
  if (action === 'drop') {
    rmSync(kitPath(ws.root, stashPath(stash.id)));
    return { dropped: stash.id };
  }
  const result = mergeLocalTrees(stash.base, ws.files, stash.files);
  startLocalOperation({
    ws,
    api,
    kind: 'stash',
    target: stash.files,
    result: result.files,
    conflicts: result.conflicts,
    version: ws.base.version,
    ...(action === 'pop' ? { pop: stash.id } : {}),
  });
  if (result.conflicts.length)
    throw new CliError(
      'Stash conflicts are saved locally. Run gamedevpl resolve, then stash continue or stash abort. The stash is retained until successful completion.',
      EXIT_REFUSED,
    );
  const completed = await finishLocalOperation(api, ws.root, 'stash');
  return { ...completed, applied: stash.id, dropped: action === 'pop' };
}

export async function stashCommand(input: Parameters<typeof stashUnlocked>[0]) {
  const here = findCheckout(input.cwd);
  if (!here) throw new CliError('Run stash inside a game checkout.', EXIT_INPUT);
  return withCheckoutWriter(here.root, () => stashUnlocked(input), {
    history: true,
    reclaimHistory: true,
    resolveMerge: ['list', 'show', 'continue', 'abort'].includes(input.args[0] ?? 'push'),
  });
}
