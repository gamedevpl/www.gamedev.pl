import { markRecoveryReady, matchingStaged } from './recovery-state.js';
import { detectLocalAdapters } from './workshop.js';
import type { handleReplLine, ReplLineResult } from './repl.js';
import { parseArgv } from './argv.js';
import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { ApiClient } from './api.js';
import { deliverySession, type DeliverySession } from './submit-session.js';
import type { TreeFile } from './checkout-sync.js';
import { findCheckout, localGameFiles, writeBase, fetchLatestTree } from './checkout.js';
import { CliError, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import type { PickChoice } from './workshop.js';

export type RecoveryResult = { token: string; slug: string; root: string };

export async function recoverCheckout(input: {
  api: ApiClient;
  cwd: string;
  slug?: string;
  yes?: boolean;
  pick?: PickChoice;
  write: (line: string) => void;
}): Promise<RecoveryResult | undefined> {
  const checkout = findCheckout(resolve(input.cwd));
  if (!checkout) throw new CliError('No local checkout found.', EXIT_INPUT, 'gamedevpl recover <checkout-directory>');
  for (const name of ['.gamedev-slug', '.gamedev-base.json', '.gamedev-recovery.json', '.gamedev-recovery-ready']) {
    const path = join(checkout.root, name);
    if (existsSync(path) && lstatSync(path).isSymbolicLink())
      throw new CliError('Recovery metadata must not be a symlink.', EXIT_REFUSED);
  }
  const slug = input.slug ?? checkout.slug;
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(slug)) throw new CliError('Invalid recovery slug.', EXIT_INPUT);
  const status = await input.api.request<{ kind: string }>('GET', `/api/me/studio/games/${slug}/recovery`);
  const pendingPath = join(checkout.root, '.gamedev-recovery.json');
  let pending:
    | {
        slug: string;
        key: string;
        origin: string;
        paths?: string[];
        base?: { version: string; files: TreeFile[] };
        session?: DeliverySession;
      }
    | undefined;
  if (existsSync(pendingPath)) {
    pending = JSON.parse(readFileSync(pendingPath, 'utf8'));
    if (pending?.slug !== slug || pending?.origin !== input.api.origin || !/^[0-9a-f-]{36}$/.test(pending?.key ?? ''))
      throw new CliError('A different recovery is pending. Resume it before changing the destination.', EXIT_REFUSED);
  }
  if (status.kind === 'occupied')
    throw new CliError(
      'This slug is unavailable. Local files are unchanged.',
      EXIT_REFUSED,
      'gamedevpl recover <directory> --slug <new-name>',
    );
  if (status.kind === 'active' && !pending)
    throw new CliError('This game already exists. Use connect instead.', EXIT_REFUSED);
  if (!['active', 'missing', 'canceled', 'archived'].includes(status.kind))
    throw new CliError('Unknown recovery status.', EXIT_REFUSED);
  const files = localGameFiles(checkout.root, checkout.slug);
  const spec = files.find((f) => f.path === 'SPEC.md')?.content;
  if (!spec) throw new CliError('Recovery needs SPEC.md in the game directory.', EXIT_INPUT);
  let metadata: { title?: string } = {};
  const game = files.find((f) => f.path === 'GAME.json');
  if (game) metadata = JSON.parse(game.content);
  const title = metadata.title ?? spec.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1];
  if (!title) throw new CliError('Set the title in GAME.json or SPEC.md before recovery.', EXIT_INPUT);
  const concept = spec.slice(0, 4000);
  if (concept.trim().length < 30)
    throw new CliError('SPEC.md needs a game description of at least 30 characters.', EXIT_INPUT);
  const dest = slug === checkout.slug ? checkout.root : join(dirname(checkout.root), `${slug}-recovered`);
  if (dest !== checkout.root && existsSync(dest)) {
    const marker = join(dest, '.gamedev-import-key');
    if (pending && existsSync(marker) && readFileSync(marker, 'utf8') === pending.key) {
      const recovered = await input.api.request<{ token: string; slug: string }>('POST', '/api/me/studio/recover', {
        slug,
        key: pending.key,
        title,
        concept,
      });
      rmSync(pendingPath);
      input.write(`Recovery already completed: ${dest}. Run gamedevpl push there.`);
      return { ...recovered, root: dest };
    }
    throw new CliError(`Recovery destination already exists: ${dest}`, EXIT_REFUSED);
  }
  input.write(
    status.kind === 'canceled'
      ? 'The round was canceled. Recover into a new self-build round.'
      : 'Import local sources into a self-build draft. Nothing will be published.',
  );
  if (
    !input.yes &&
    (!input.pick ||
      (await input.pick(['Recover local sources', 'Keep files and return'], 'Recover this checkout?')) !==
        'Recover local sources')
  ) {
    input.write('Files unchanged. To recover from your shell, repeat with --yes.');
    return;
  }
  pending ??= { slug, key: randomUUID(), origin: input.api.origin };
  writeFileSync(pendingPath, JSON.stringify(pending), { mode: 0o600 });
  let recovered: { token: string; slug: string };
  try {
    recovered = await input.api.request('POST', '/api/me/studio/recover', { slug, key: pending.key, title, concept });
  } catch (error) {
    if (
      error instanceof CliError &&
      ['slug_unavailable', 'recovery_changed', 'invalid recovery request', 'content_rejected'].includes(
        error.apiCode ?? '',
      )
    )
      rmSync(pendingPath);
    throw error;
  }
  pending.base ??= await fetchLatestTree(input.api, slug);
  pending.session ??= (await deliverySession(input.api, slug)) ?? undefined;
  if (!pending.session) throw new CliError('Recovery session is unavailable. Retry recovery.', EXIT_REFUSED);
  writeFileSync(pendingPath, JSON.stringify(pending), { mode: 0o600 });
  const imported = files.map((file) => {
    if (slug === checkout.slug) return file;
    if (file.path === 'SPEC.md') return { ...file, content: file.content.replace(/^slug:.*$/m, `slug: ${slug}`) };
    if (file.path === 'GAME.json') {
      const json = JSON.parse(file.content);
      if (json.slug !== undefined) json.slug = slug;
      return { ...file, content: JSON.stringify(json, null, 2) + '\n' };
    }
    return file;
  });
  const currentPaths = new Set(imported.map((file) => file.path));
  for (const path of pending.paths ?? []) {
    if (!currentPaths.has(path))
      await input.api.request('POST', `/api/me/studio/games/${slug}/sources/stage/delete`, { path });
  }
  pending.paths = [...new Set([...(pending.paths ?? []), ...currentPaths])];
  writeFileSync(pendingPath, JSON.stringify(pending), { mode: 0o600 });
  const alreadyStaged = await matchingStaged(input.api, slug, imported);
  for (const file of imported) {
    if (alreadyStaged.has(file.path)) continue;
    const result = await input.api.request<{ accepted?: boolean }>(
      'PUT',
      `/api/me/studio/games/${slug}/sources/stage`,
      { ...file, rebuild: false },
    );
    if (result.accepted === false)
      throw new CliError('Staging refused. Recovery can be retried; local files are unchanged.', EXIT_REFUSED);
  }
  const temporary = dest !== checkout.root ? mkdtempSync(join(dirname(dest), '.gamedev-recovery-')) : undefined;
  const output = temporary ?? dest;
  try {
    if (temporary) {
      cpSync(checkout.root, temporary, {
        recursive: true,
        filter: (path) =>
          !lstatSync(path).isSymbolicLink() &&
          !['.git', 'node_modules', '.gamedev-recovery.json', '.gamedev-import-key'].includes(basename(path)),
      });
      renameSync(join(output, 'games', checkout.slug), join(output, 'games', slug));
      for (const file of imported.filter((f) => f.path === 'SPEC.md' || f.path === 'GAME.json'))
        writeFileSync(join(output, 'games', slug, file.path), file.content);
      const lockPath = join(output, 'gamedev.lock');
      if (existsSync(lockPath)) {
        const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
        lock.slug = slug;
        writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
      }
    }
    writeFileSync(join(output, '.gamedev-slug'), slug + '\n');
    writeBase(output, pending.base.version, pending.base.files);
    markRecoveryReady(output, slug, pending.session, pending.base.version);
    if (temporary) {
      writeFileSync(join(output, '.gamedev-import-key'), pending.key);
      renameSync(temporary, dest);
    }
  } finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  }
  rmSync(pendingPath);
  input.write(
    `Sources recovered and staged. Checkout: ${dest}. Run gamedevpl push there to check and deliver a preview.`,
  );
  return { ...recovered, root: dest };
}

export async function recoverCommand(
  api: ApiClient,
  line: string,
  cwd: string,
  pick: PickChoice | undefined,
  write: (line: string) => void,
): Promise<RecoveryResult | undefined> {
  const { args, flags } = parseArgv(['node', 'cli', ...line.slice(1).split(/\s+/)]);
  return recoverCheckout({
    api,
    cwd: args[0] ?? cwd,
    slug: typeof flags.slug === 'string' ? flags.slug : undefined,
    yes: flags.yes === true,
    pick,
    write,
  });
}

export async function recoverRepl(input: Parameters<typeof handleReplLine>[0]): Promise<ReplLineResult> {
  const recovered = await recoverCommand(
    input.api,
    input.line.trim(),
    input.workshop?.root ?? process.cwd(),
    input.pick,
    input.write,
  );
  if (!recovered) return { next: 'continue' };
  const env = input.env ?? process.env;
  const workshop = {
    env,
    adapters: detectLocalAdapters(env),
    pick:
      input.pick ??
      (async () => {
        throw new CliError('This action needs an interactive terminal.', EXIT_INPUT);
      }),
    abort: input.abort ?? { current: null },
    telemetry: input.telemetry,
    ...input.workshop,
    ...recovered,
    builder: 'self',
  };
  input.onWorkshop?.(workshop);
  return { next: 'continue', token: recovered.token, slug: recovered.slug, workshop };
}
