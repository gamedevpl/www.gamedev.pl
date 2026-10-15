import type { HistoryVersion, HistorySourceFile } from '@gamedevpl/contract';
import type { ApiClient } from './api.js';
import { findCheckout } from './checkout.js';
import { sourceProject } from './source-project.js';
import { jsonMode } from './argv.js';
import { stripTerminalControls } from './ansi.js';
import { CliError, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import { historyVersion, historySlug, readHistory, readHistoryTree } from './history-api.js';
import { sourceBytes } from './git-history-import.js';
import { versionBlame, versionPatch, withHistoryGit } from './history-git.js';

type Flags = Record<string, string | boolean>;
export function isHistoryVerb(verb: string, args: string[], flags: Flags): boolean {
  return (
    ['log', 'show', 'blame'].includes(verb) ||
    (verb === 'diff' &&
      (flags.from !== undefined ||
        flags.to !== undefined ||
        (args.length === 2 && args.every((arg) => /^v-?\d/.test(arg)))))
  );
}

export function formatHistoryVersion(row: HistoryVersion): string {
  return [
    row.version,
    row.createdAt,
    row.deliveryMode ?? 'publish',
    row.verdict ?? 'unknown',
    row.backend,
    row.model,
    row.summary,
  ]
    .filter(Boolean)
    .join('  ');
}

export async function historyCommand(input: {
  verb: string;
  args: string[];
  flags: Flags;
  api: ApiClient;
  cwd?: string;
  slug?: string;
  write: (text: string) => void;
}): Promise<boolean> {
  const { verb, args, flags, api } = input;
  if (!isHistoryVerb(verb, args, flags)) return false;
  if (flags.slug !== undefined && typeof flags.slug !== 'string')
    throw new CliError('--slug needs a game slug', EXIT_INPUT);
  const explicit =
    (typeof flags.slug === 'string' ? flags.slug : undefined) ?? (verb === 'log' ? args[0] : undefined) ?? input.slug;
  let here: ReturnType<typeof findCheckout> = null;
  try {
    here = findCheckout(input.cwd ?? process.cwd());
  } catch (error) {
    if (!explicit) throw error;
  }
  const chosen = explicit ?? here?.slug;
  if (!chosen) throw new CliError('choose a game with --slug <slug>, or run inside its checkout', EXIT_INPUT);
  const slug = historySlug(chosen);
  const emit = (data: unknown, text: string) =>
    input.write(jsonMode(flags) ? JSON.stringify(data) : stripTerminalControls(text));
  if (verb === 'log') {
    if (args.length > 1) throw new CliError('usage: gamedevpl log [slug] [--limit N | --all]', EXIT_INPUT);
    const limit = flags.all ? Infinity : Number(flags.limit ?? 20);
    if (flags.limit !== undefined && typeof flags.limit !== 'string')
      throw new CliError('--limit needs a number', EXIT_INPUT);
    if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 1))
      throw new CliError('--limit must be a positive integer', EXIT_INPUT);
    const versions = await readHistory(api, slug, limit);
    emit({ slug, versions }, versions.map(formatHistoryVersion).join('\n') || 'No delivered versions yet.');
    return true;
  }
  if (verb === 'diff') {
    const before = historyVersion(typeof flags.from === 'string' ? flags.from : (args[0] ?? ''));
    const after = historyVersion(typeof flags.to === 'string' ? flags.to : (args[1] ?? ''));
    const trees = await Promise.all([readHistoryTree(api, slug, before), readHistoryTree(api, slug, after)]);
    const patch = await withHistoryGit(
      {
        slug,
        versions: trees.map((tree) => tree.metadata),
        trees: new Map(trees.map((tree) => [tree.version, tree.files])),
      },
      (git) => versionPatch(git, slug, before, after),
    );
    emit({ slug, from: before, to: after, patch }, patch || 'No source changes.');
    return true;
  }
  if (verb === 'show') {
    if (args.length !== 1) throw new CliError('usage: gamedevpl show <version> [--slug <slug>]', EXIT_INPUT);
    const version = historyVersion(args[0]!);
    const tree = await readHistoryTree(api, slug, version);
    const versions = await readHistory(api, slug);
    const index = versions.findIndex((row) => row.version === version);
    if (index < 0) throw new CliError('version not found in history', EXIT_REFUSED);
    const parent = versions[index + 1];
    const trees = new Map<string, HistorySourceFile[]>([[version, tree.files]]);
    if (parent) trees.set(parent.version, (await readHistoryTree(api, slug, parent.version)).files);
    const patch = await withHistoryGit(
      { slug, versions: parent ? [parent, tree.metadata] : [tree.metadata], trees },
      (git) => versionPatch(git, slug, parent?.version ?? null, version),
    );
    emit(
      { slug, metadata: tree.metadata, parent: parent?.version ?? null, patch },
      `${formatHistoryVersion(tree.metadata)}\n\n${patch || 'No source changes.'}`,
    );
    return true;
  }
  if (args.length !== 1)
    throw new CliError('usage: gamedevpl blame <file> [--version <version>] [--slug <slug>]', EXIT_INPUT);
  const versions = await readHistory(api, slug);
  const version = typeof flags.version === 'string' ? historyVersion(flags.version) : versions[0]?.version;
  if (!version) throw new CliError('no delivered versions yet', EXIT_REFUSED);
  const index = versions.findIndex((row) => row.version === version);
  if (index < 0) throw new CliError('version not found in history', EXIT_REFUSED);
  let path = args[0]!;
  const prefix = `games/${slug}/`;
  if (path.startsWith(prefix)) path = path.slice(prefix.length);
  else if (here && sourceProject(here.root) && path.startsWith('src/')) path = path.slice(4);
  if (
    !path ||
    path.split(/[\\/]/).some((part) => !part || part === '..' || part === '.git') ||
    [...path].some((char) => char.charCodeAt(0) < 32)
  )
    throw new CliError('invalid source path', EXIT_INPUT);
  const selected = versions.slice(index);
  const trees = new Map<string, HistorySourceFile[]>();
  for (const row of selected) {
    const files = row.sourceFiles.includes(path)
      ? (await readHistoryTree(api, slug, row.version, path)).files.filter((file) => file.path === path)
      : [];
    trees.set(row.version, files);
  }
  const file = trees.get(version)?.[0];
  if (!file) throw new CliError('file not found in this version', EXIT_REFUSED);
  if (file.encoding === 'base64' || sourceBytes(file).includes(0))
    throw new CliError('blame requires a text source file', EXIT_INPUT);
  const lines = await withHistoryGit({ slug, versions: selected, trees }, (git) =>
    versionBlame(git, slug, version, path, selected),
  );
  emit(
    { slug, version, path, lines },
    lines
      .map((row) => `${row.version} ${row.createdAt} ${row.line.toString().padStart(5)} | ${row.content}`)
      .join('\n'),
  );
  return true;
}
