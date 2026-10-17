import { isRasterSourcePath } from '@gamedevpl/contract';
import type { ApiClient } from './api.js';
import { sanitizePath } from './ansi.js';
import { jsonMode } from './argv.js';
import { findCheckout, localGameFiles } from './checkout.js';
import { hashContent, hashesOf, readBase } from './checkout-sync.js';
import { CliError, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import { historySlug, historyVersion, readHistory, readHistoryTree } from './history-api.js';
import { historyTree, localBytes, localTree, reverseVersion, sourcePath } from './history-edit-tree.js';
import {
  historyIdentity,
  installHistorySources,
  pendingHistoryRoot,
  prepareSources,
  recoverHistoryEdit,
  sourceSnapshot,
} from './history-edit-files.js';
import { createIgnoreMatcher } from './ignore.js';
import { kitPath } from './kit-install.js';
import { gameSourcePath, sourceProject, sourceSpecSlug } from './source-project.js';
import { withCheckoutWriter } from './workbench-lock.js';

type Flags = Record<string, string | boolean>;
type Input = {
  verb: string;
  args: string[];
  flags: Flags;
  api: ApiClient;
  cwd?: string;
  slug?: string;
  write: (text: string) => void;
  writeLog?: (text: string) => Promise<boolean>;
  signal?: AbortSignal;
};
export const isHistoryEditVerb = (verb: string, flags: Flags): boolean =>
  ['restore', 'revert'].includes(verb) || (verb === 'checkout' && flags.version !== undefined);

export async function historyEditCommand(input: Input): Promise<boolean> {
  const { flags, args, verb } = input,
    cwd = input.cwd ?? process.cwd();
  const write = async (data: unknown, text: string) => {
    const output = jsonMode(flags) ? JSON.stringify(data) : text;
    if (input.writeLog) await input.writeLog(output);
    else input.write(output);
  };
  const allowed = new Set(['slug', 'version', 'force', 'dry-run', 'recover', 'json', 'no-pager']);
  for (const name of Object.keys(flags))
    if (!allowed.has(name)) throw new CliError(`Unknown history edit option: --${name}`, EXIT_INPUT);
  for (const name of ['force', 'dry-run', 'recover'])
    if (flags[name] !== undefined && typeof flags[name] !== 'boolean')
      throw new CliError(`--${name} is a boolean flag`, EXIT_INPUT);
  const pending = pendingHistoryRoot(cwd);
  if (flags.recover) {
    if (
      verb !== 'restore' ||
      args.length ||
      flags.version !== undefined ||
      flags.force ||
      flags['dry-run'] ||
      flags.slug !== undefined
    )
      throw new CliError('usage: gamedevpl restore --recover [--json]', EXIT_INPUT);
    if (!pending) throw new CliError('No interrupted history operation was found.', EXIT_REFUSED);
    const result = await withCheckoutWriter(pending, async () => recoverHistoryEdit(pending), {
      history: true,
      recoverHistory: true,
    });
    await write(result, 'Recovered the interrupted history operation. Review gamedevpl diff before pushing.');
    return true;
  }
  if (pending)
    throw new CliError('An interrupted history operation needs recovery: gamedevpl restore --recover', EXIT_REFUSED);
  const selected = flags.version === undefined ? args[0] : flags.version;
  if (
    typeof selected !== 'string' ||
    args.length > 1 ||
    (verb === 'checkout' && flags.version === undefined) ||
    (verb !== 'checkout' && flags.version !== undefined && args.length)
  )
    throw new CliError(
      'usage: gamedevpl restore <version> | checkout --version <version> | revert <version>',
      EXIT_INPUT,
    );
  const version = historyVersion(selected);
  if (verb === 'revert' && flags.force)
    throw new CliError('revert does not discard local edits; save or deliver them first.', EXIT_INPUT);
  const here = findCheckout(cwd);
  if (!here) throw new CliError('Run history edits inside an existing game checkout.', EXIT_INPUT);
  if (
    (flags.slug !== undefined && flags.slug !== here.slug) ||
    (input.slug && input.slug !== here.slug) ||
    (verb === 'checkout' && args[0] && args[0] !== here.slug)
  )
    throw new CliError('The requested game does not match this checkout.', EXIT_REFUSED);
  const slug = historySlug(here.slug),
    operation = verb === 'revert' ? 'revert' : 'restore';
  return withCheckoutWriter(
    here.root,
    async () => {
      const identity = historyIdentity(here.root),
        source = gameSourcePath(here.root, slug),
        game = kitPath(here.root, source);
      const snapshot = sourceSnapshot(game),
        project = Boolean(sourceProject(here.root));
      const base = readBase(here.root);
      if (!base || Array.isArray(base.files) || Object.values(base.files).some((hash) => typeof hash !== 'string'))
        throw new CliError(
          'This checkout has no valid synchronization base; reconcile it with gamedevpl pull first.',
          EXIT_REFUSED,
        );
      for (const path of Object.keys(base.files)) sourcePath(path);
      const files = localGameFiles(here.root, slug),
        local = hashesOf(files);
      const dirty = [...new Set([...Object.keys(local), ...Object.keys(base.files)])].filter(
        (path) => local[path] !== base.files[path],
      );
      if (dirty.length && !flags.force)
        throw new CliError(
          'Local source edits would be replaced. Save or deliver them first; restore --force keeps a recovery copy.',
          EXIT_REFUSED,
        );
      const versions = await readHistory(input.api, slug),
        latest = versions[0],
        index = versions.findIndex((row) => row.version === version);
      if (!latest || index < 0) throw new CliError('Version not found in delivered history.', EXIT_REFUSED);
      if (base.version !== latest.version)
        throw new CliError(
          'The platform has moved since this checkout base. Run gamedevpl pull before editing history.',
          EXIT_REFUSED,
        );
      const parent = versions[index + 1];
      const ids = [
        ...new Set([version, latest.version, ...(operation === 'revert' && parent ? [parent.version] : [])]),
      ];
      const trees = new Map(
        await Promise.all(
          ids.map(async (id) => {
            const tree = await readHistoryTree(input.api, slug, id, undefined, input.signal);
            if (tree.slug !== slug || tree.version !== id)
              throw new CliError('History tree does not match the requested game and version.', EXIT_REFUSED);
            return [id, historyTree(tree)] as const;
          }),
        ),
      );
      for (const [path, hash] of Object.entries(base.files)) {
        const bytes = trees.get(latest.version)!.get(path);
        if (
          !bytes ||
          hashContent(isRasterSourcePath(path) ? bytes.toString('base64') : bytes.toString('utf8')) !== hash
        )
          throw new CliError(
            'Synchronization base does not match its delivered version; reconcile the checkout first.',
            EXIT_REFUSED,
          );
      }
      const target = trees.get(version)!;
      const desired =
        operation === 'restore'
          ? target
          : await reverseVersion(
              slug,
              version,
              target,
              parent ? trees.get(parent.version) : undefined,
              localTree(files),
            );
      if (project && sourceSpecSlug(desired.get('SPEC.md')?.toString('utf8') ?? '') !== slug)
        throw new CliError(
          'The resulting SPEC.md would change or remove this source repository’s game identity.',
          EXIT_REFUSED,
        );
      const matcher = createIgnoreMatcher(here.root);
      for (const path of desired.keys())
        if (!Object.hasOwn(base.files, path) && matcher.ignored(`${source}/${path}`, false))
          throw new CliError(`Historical source is ignored; unignore it before restoring: ${path}`, EXIT_REFUSED);
      const managed = new Set([...Object.keys(base.files), ...files.map((file) => file.path)]);
      const after = prepareSources(
        snapshot,
        managed,
        new Map([...desired].map(([path, bytes]) => [path, localBytes(path, bytes, project)])),
      );
      const changed = { added: [] as string[], modified: [] as string[], deleted: [] as string[] };
      for (const path of [...new Set([...snapshot.files.keys(), ...after.files.keys()])].sort()) {
        const before = snapshot.files.get(path)?.bytes,
          next = after.files.get(path)?.bytes;
        if (!before && next) changed.added.push(path);
        else if (before && !next) changed.deleted.push(path);
        else if (before && next && !before.equals(next)) changed.modified.push(path);
      }
      const dryRun = flags['dry-run'] === true,
        count = Object.values(changed).reduce((sum, paths) => sum + paths.length, 0);
      const backup =
        !dryRun && count ? installHistorySources({ root: here.root, source, before: snapshot, after, identity }) : null;
      const result = {
        slug,
        operation,
        version,
        parent: parent?.version ?? null,
        base: base.version,
        dryRun,
        changed,
        backup,
      };
      await write(
        result,
        `${dryRun ? 'Would apply' : 'Applied'} ${operation} ${version}: ${changed.added.length} added, ${changed.modified.length} modified, ${changed.deleted.length} deleted.${backup ? `\nRecovery copy: ${sanitizePath(backup)}` : ''}\nChanges stay local. Review gamedevpl diff; gamedevpl push delivers a new preview.`,
      );
      return true;
    },
    { history: true },
  );
}
