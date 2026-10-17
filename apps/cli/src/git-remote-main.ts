#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { stderr, stdin, stdout } from 'node:process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApi, type ApiClient } from './api.js';
import { encryptedFileStore, memoryStore } from './keychain.js';
import { originFromEnv } from './oauth.js';
import { describeError } from './errors.js';
import { submitGame, type SubmitResult } from './submit.js';
import { runRemoteHelper, type PushResult } from './git-remote.js';
import { materializePushCheckout } from './git-ref.js';
import { GIT_REMOTE_SCHEME } from './bin-name.js';
import { localGameFiles, trackedTree, writeBase } from './checkout.js';
import { writeFileSync } from 'node:fs';
import {
  checkoutGit,
  gitConfig,
  remoteLayout,
  historyScope,
  projectGitFiles,
  type GitLayout,
} from './git-checkout-layout.js';
import { gitPushBase } from './git-push-base.js';
import { synchronizeGitDelivery } from './git-delivery-sync.js';
import { sameGitSources } from './git-delivery-ref.js';
import { formatIgnoredNotice } from './working-copy.js';
import { readHistory, readHistoryTree, historySlug } from './history-api.js';
import { knownHistoryCommits } from './git-history-cache.js';

function slugFromUrl(url: string): string {
  const prefix = `${GIT_REMOTE_SCHEME}://`;
  const stripped = url.startsWith(prefix) ? url.slice(prefix.length) : url;
  return stripped.replace(/\/$/, '');
}

export function remoteSlugFromArgv(argv: string[], cwdSlug: string | null): string {
  return slugFromUrl(argv[3] ?? argv[2] ?? cwdSlug ?? '');
}

function storeFromEnv(env: NodeJS.ProcessEnv) {
  if (env.GAMEDEV_TOKEN) {
    return memoryStore({ accessToken: env.GAMEDEV_TOKEN, tokenType: 'Bearer', scope: 'creator' });
  }
  return encryptedFileStore(env);
}

function readSlugFile(cwd: string): string | null {
  const path = join(cwd, '.gamedev-slug');
  return existsSync(path) ? readFileSync(path, 'utf8').trim() : null;
}

function adoptCheckoutBase(cwd: string, slug: string, dest: string, result: SubmitResult): void {
  if (result.kind === 'delivered') writeBase(cwd, result.version, trackedTree(cwd, slug, result.files));
  else writeBase(cwd, result.sync.version, localGameFiles(dest, slug));
}

export async function reconcilePush(input: {
  api: ApiClient;
  slug: string;
  cwd: string;
  srcRef: string;
  submit?: typeof submitGame;
  layout?: GitLayout;
  scope?: string;
}): Promise<PushResult> {
  const tmp = mkdtempSync(join(tmpdir(), 'gamedev-push-'));
  try {
    const commit = checkoutGit(input.cwd)(['rev-parse', '--verify', '--end-of-options', `${input.srcRef}^{commit}`])
      .toString()
      .trim();
    const dest = materializePushCheckout({
      repo: input.cwd,
      srcRef: commit,
      slug: input.slug,
      cwd: input.cwd,
      dest: tmp,
      layout: input.layout,
    });
    if (input.scope && input.layout) {
      const base = await gitPushBase({ ...input, commit, scope: input.scope, layout: input.layout });
      writeFileSync(
        join(dest, '.gamedev-base.json'),
        JSON.stringify({ ...base, ...(input.layout.root === 'src' ? { slug: input.slug } : {}) }),
      );
    }
    const pushed = localGameFiles(dest, input.slug);
    const result = await (input.submit ?? submitGame)({ api: input.api, slug: input.slug, dest });
    try {
      if (input.scope && input.layout) {
        const version = result.kind === 'delivered' ? result.version : result.sync.version;
        const synced = await synchronizeGitDelivery({
          ...input,
          commit,
          version,
          pushed,
          scope: input.scope,
          layout: input.layout,
        });
        if (
          checkoutGit(input.cwd)(['rev-parse', 'HEAD']).toString().trim() === commit &&
          sameGitSources(pushed, synced.files)
        )
          writeBase(input.cwd, synced.version, trackedTree(input.cwd, input.slug, synced.files));
      } else adoptCheckoutBase(input.cwd, input.slug, dest, result);
    } catch {
      stderr.write(
        'Delivery succeeded, but local synchronization metadata could not be recorded. Review gamedevpl status before another delivery.\n',
      );
    }
    const notice = formatIgnoredNotice(result.ignored);
    if (notice.length) stderr.write(`${notice.join('\n')}\n`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describeError(error).message };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export async function runGitRemoteHelper(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  options: { submit?: typeof submitGame } = {},
): Promise<number> {
  const slug = remoteSlugFromArgv(argv, readSlugFile(process.cwd()));
  if (!slug) {
    stdout.write('error missing game slug\n');
    return 1;
  }
  const api = createApi({ origin: originFromEnv(env), store: storeFromEnv(env), env });
  historySlug(slug);
  const git = checkoutGit(process.cwd()),
    remote = argv[2] && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(argv[2]) ? argv[2] : undefined,
    layout = remote ? remoteLayout(git, slug, remote) : { root: `games/${slug}`, rasters: 'raw' as const };
  const pinned = remote ? gitConfig(git, `remote.${remote}.gamedevpl-origin`) : undefined;
  if (pinned && pinned !== api.origin) throw Error('This Git remote belongs to another platform origin.');
  const scope = historyScope(api.origin, slug, layout);
  const rl = createInterface({ input: stdin, crlfDelay: Infinity });
  try {
    const iter = rl[Symbol.asyncIterator]();
    await runRemoteHelper(slug, {
      readLine: async () => {
        const next = await iter.next();
        return next.done ? null : String(next.value);
      },
      write: (line) => stdout.write(line.endsWith('\n') ? line : `${line}\n`),
      fetchVersions: (game) => readHistory(api, game),
      fetchTree: async (game, version) => projectGitFiles((await readHistoryTree(api, game, version)).files, layout),
      knownCommits: () => knownHistoryCommits(slug, process.cwd(), scope),
      scope,
      importScript: async (script) => {
        await new Promise<void>((resolve, reject) =>
          stdout.write(script, (error) => (error ? reject(error) : resolve())),
        );
      },
      sourceRoot: layout.root,
      preserveOutsideSources: Boolean(pinned),
      pushReconcile: async (src) =>
        reconcilePush({
          api,
          slug,
          cwd: process.cwd(),
          srcRef: src,
          layout,
          submit: options.submit,
          ...(pinned ? { scope } : {}),
        }),
    });
    return 0;
  } finally {
    rl.close();
  }
}

if (process.argv[1] && /git-remote-main\.(js|ts)$/.test(process.argv[1])) {
  void runGitRemoteHelper(process.argv, process.env).then((code) => process.exit(code));
}
