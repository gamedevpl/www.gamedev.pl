import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { ApiClient } from './api.js';
import { gitRemoteUrl } from './bin-name.js';
import { findCheckout } from './checkout.js';
import { readBase } from './checkout-sync.js';
import { CliError, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import { historySlug, readHistory, readHistoryTree } from './history-api.js';
import { historyTree } from './history-edit-tree.js';
import { fastImportScript, versionImportRef } from './git-history-import.js';
import { knownHistoryCommits } from './git-history-cache.js';
import { checkoutGit, gitConfig, historyScope, projectGitFiles, type CheckoutGit } from './git-checkout-layout.js';
import { gameSourcePath } from './source-project.js';
import { withCheckoutWriter } from './workbench-lock.js';
import { kitPath } from './kit-install.js';
import { bootstrapGitBranch } from './git-bootstrap.js';

function revision(git: CheckoutGit, ref: string): string | null {
  try {
    return git(['rev-parse', '--verify', ref]).toString().trim();
  } catch {
    return null;
  }
}
function excludeWorkspace(git: CheckoutGit, root: string, source: string, fresh: boolean): void {
  const common = resolve(root, git(['rev-parse', '--git-common-dir']).toString().trim());
  const path = kitPath(common, 'info/exclude');
  if (existsSync(path) && (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()))
    throw new CliError('Git exclude must be a regular file.', EXIT_REFUSED);
  const before = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const lines = ['/.gamedev-base.json', '/.gamedev-slug', '/.gamedev/'];
  if (fresh) lines.push('/*', ...(source === 'src' ? ['!/src/'] : ['!/games/', '/games/*', `!/${source}/`]));
  const extra = lines.filter((line) => !before.split(/\r?\n/).includes(line));
  if (extra.length) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, before + (before.endsWith('\n') || !before ? '' : '\n') + extra.join('\n') + '\n');
  }
}

export async function initializeGitCheckout(input: { api: ApiClient; root: string; remote?: string }) {
  return withCheckoutWriter(input.root, async () => {
    const here = findCheckout(input.root);
    if (!here || resolve(here.root) !== resolve(input.root))
      throw new CliError('Run Git setup from an existing game checkout root.', EXIT_INPUT);
    const slug = historySlug(here.slug),
      git = checkoutGit(here.root);
    git(['--version']);
    const marker = join(here.root, '.git');
    if (existsSync(marker) && lstatSync(marker).isSymbolicLink())
      throw new CliError('Git setup refuses a symbolic .git path.', EXIT_REFUSED);
    const repository = existsSync(marker);
    if (repository && resolve(git(['rev-parse', '--show-toplevel']).toString().trim()) !== resolve(here.root))
      throw new CliError('Git repository root does not match this checkout.', EXIT_REFUSED);
    const head = repository ? revision(git, 'HEAD') : null;
    if (repository && !head && git(['ls-files', '-z']).length)
      throw new CliError('Commit or unstage the existing index before initializing game history.', EXIT_REFUSED);
    const remote =
      input.remote ??
      (repository &&
      gitConfig(git, 'remote.origin.url') === gitRemoteUrl(slug) &&
      (!head || gitConfig(git, 'remote.origin.gamedevpl-origin') === input.api.origin)
        ? 'origin'
        : repository
          ? 'gamedevpl'
          : 'origin');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(remote)) throw new CliError('Invalid Git remote name.', EXIT_INPUT);
    const url = repository ? gitConfig(git, `remote.${remote}.url`) : undefined;
    if (url && url !== gitRemoteUrl(slug))
      throw new CliError(`Git remote ${remote} already points elsewhere; choose --remote <name>.`, EXIT_REFUSED);
    const pinnedOrigin = repository ? gitConfig(git, `remote.${remote}.gamedevpl-origin`) : undefined;
    if (pinnedOrigin && pinnedOrigin !== input.api.origin)
      throw new CliError('This Git remote belongs to another platform origin.', EXIT_REFUSED);
    const root = gameSourcePath(here.root, slug),
      layout = { root, rasters: root === 'src' ? ('raw' as const) : ('base64' as const) },
      scope = historyScope(input.api.origin, slug, layout),
      versions = await readHistory(input.api, slug);
    if (!repository) {
      git(['init', '--quiet', '--template=', '--initial-branch=main']);
    }
    if (!url) git(['remote', 'add', remote, gitRemoteUrl(slug)]);
    for (const [key, value] of Object.entries({ root, rasters: layout.rasters, origin: input.api.origin }))
      git(['config', `remote.${remote}.gamedevpl-${key}`, value]);
    const known = knownHistoryCommits(slug, here.root, scope);
    let parent: string | undefined;
    let previousFiles: string[] = [];
    for (const row of [...versions].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.version.localeCompare(b.version),
    )) {
      const cached = known.get(row.version);
      if (cached) {
        parent = cached;
        previousFiles = row.sourceFiles;
        continue;
      }
      const tree = await readHistoryTree(input.api, slug, row.version);
      if (tree.slug !== slug || tree.version !== row.version)
        throw new CliError('History tree does not match this game and version.', EXIT_REFUSED);
      historyTree(tree);
      git(
        ['fast-import', '--quiet'],
        fastImportScript({
          slug,
          versions: [row],
          scope,
          parent,
          sourceRoot: root,
          trees: new Map([[row.version, projectGitFiles(tree.files, layout)]]),
          preserveOutsideSources: true,
          parentSourceFiles: previousFiles,
        }),
      );
      parent = revision(git, versionImportRef(slug, row.version, scope)) ?? undefined;
      previousFiles = row.sourceFiles;
    }
    const latest = versions[0],
      tracking = `refs/remotes/${remote}/main`;
    if (latest) git(['update-ref', tracking, versionImportRef(slug, latest.version, scope)]);
    let initialized = false;
    if (!head && latest) {
      if (revision(git, 'HEAD') || git(['ls-files', '-z']).length)
        throw new CliError('Git HEAD or index changed during history setup; local state was preserved.', EXIT_REFUSED);
      const base = readBase(here.root)?.version,
        selected = versions.some((row) => row.version === base) ? base! : latest.version,
        commit = revision(git, versionImportRef(slug, selected, scope))!,
        branch = git(['symbolic-ref', 'HEAD']).toString().trim();
      bootstrapGitBranch(here.root, branch, commit);
      initialized = true;
    }
    if (!head) {
      const name = git(['symbolic-ref', 'HEAD'])
        .toString()
        .trim()
        .replace(/^refs\/heads\//, '');
      git(['config', `branch.${name}.remote`, remote]);
      git(['config', `branch.${name}.merge`, 'refs/heads/main']);
    }
    excludeWorkspace(git, here.root, root, !head);
    return { slug, root: here.root, remote, versions: versions.length, initialized, tracking: `${remote}/main` };
  });
}

export async function gitCheckoutCommand(input: {
  api: ApiClient;
  cwd: string;
  args: string[];
  flags: Record<string, string | boolean>;
}) {
  if (
    input.args.length !== 1 ||
    input.args[0] !== 'init' ||
    Object.keys(input.flags).some((key) => !['remote', 'json'].includes(key)) ||
    (input.flags.remote !== undefined && typeof input.flags.remote !== 'string')
  )
    throw new CliError('usage: gamedevpl git init [--remote <name>] [--json]', EXIT_INPUT);
  const here = findCheckout(input.cwd);
  if (!here) throw new CliError('Download sources with gamedevpl checkout before opting into Git.', EXIT_INPUT);
  return initializeGitCheckout({
    api: input.api,
    root: here.root,
    remote: typeof input.flags.remote === 'string' ? input.flags.remote : undefined,
  });
}
