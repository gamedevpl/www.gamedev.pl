import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { ApiClient } from './api.js';
import { findCheckout } from './checkout.js';
import { CliError, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import { prepareWorkspace } from './prepare-workspace.js';
import { startLocalPlay } from './play.js';
import { installPreparedKit, kitPath, recoverKitInstall } from './kit-install.js';
import type { PickChoice } from './workshop.js';
import type { CliTelemetry } from './telemetry.js';

type KitLock = { slug: string; engineRef: string; kitSha256: string; kitUrl: string; issuedAt: string };
type Input = {
  api: ApiClient;
  cwd: string;
  env: NodeJS.ProcessEnv;
  write: (line: string) => void;
  pick?: PickChoice;
  abort?: AbortSignal;
  telemetry?: CliTelemetry;
  activity?: (text: string) => void;
};

function readPin(root: string): Partial<KitLock> {
  const path = kitPath(root, 'gamedev.lock');
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Partial<KitLock>) : {};
}

async function releaseRequest(input: Input, slug: string): Promise<KitLock> {
  input.abort?.throwIfAborted();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  try {
    return await Promise.race([
      input.api.request<KitLock>('GET', `/api/me/studio/games/${encodeURIComponent(slug)}/workspace?kitOnly=true`),
      new Promise<never>((_, reject) => {
        cancel = () => reject(new CliError('Kit update check cancelled.', EXIT_REFUSED));
        input.abort?.addEventListener('abort', cancel, { once: true });
        timer = setTimeout(
          () => reject(new CliError('Kit update check timed out. Retry with /kit.', EXIT_REFUSED)),
          15_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    input.abort?.removeEventListener('abort', cancel);
  }
}

export async function checkKit(
  input: Input,
): Promise<{ root: string; lock: KitLock; current: boolean; repair: boolean }> {
  const checkout = findCheckout(input.cwd);
  if (!checkout) throw new CliError('Open a game checkout to update its Creator Kit.', EXIT_INPUT);
  const root = realpathSync(checkout.root);
  const lock = await releaseRequest(input, checkout.slug);
  if (
    !lock ||
    typeof lock !== 'object' ||
    lock.slug !== checkout.slug ||
    !/^[a-f0-9]{7,64}$/i.test(lock.engineRef) ||
    !/^[a-f0-9]{64}$/i.test(lock.kitSha256) ||
    typeof lock.kitUrl !== 'string' ||
    !/^https?:\/\//.test(lock.kitUrl) ||
    !Number.isFinite(Date.parse(lock.issuedAt))
  )
    throw new CliError('The server returned an invalid Creator Kit release.', EXIT_REFUSED);
  const pin = readPin(root);
  const manifestPath = kitPath(root, '.gamedev/kit-manifest.json');
  const installed = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as Partial<KitLock>)
    : {};
  return {
    root,
    lock,
    repair: pin.engineRef === lock.engineRef,
    current:
      installed.kitSha256 === lock.kitSha256 &&
      existsSync(kitPath(root, 'node_modules')) &&
      pin.engineRef === lock.engineRef &&
      pin.kitSha256 === lock.kitSha256 &&
      !existsSync(kitPath(root, '.gamedev/kit-update.json')) &&
      !existsSync(kitPath(root, '.gamedev/kit-update.pid')),
  };
}

export async function updateKit(input: Input & { release?: Awaited<ReturnType<typeof checkKit>> }): Promise<void> {
  const release = input.release ?? (await checkKit(input));
  const { root, lock } = release;
  const state = kitPath(root, '.gamedev');
  mkdirSync(state, { recursive: true });
  const busy = kitPath(root, '.gamedev/kit-update.pid');
  if (existsSync(busy)) {
    const pid = Number(readFileSync(busy, 'utf8'));
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch (error) {
      alive = (error as NodeJS.ErrnoException).code !== 'ESRCH';
    }
    if (alive) throw new CliError('Another Kit update is running in this checkout.', EXIT_REFUSED);
    rmSync(busy);
  }
  writeFileSync(busy, String(process.pid), { flag: 'wx', mode: 0o600 });
  let stage: string | undefined;
  try {
    recoverKitInstall(root);
    if (release.current) {
      input.write('Creator Kit is up to date.');
      return;
    }
    input.abort?.throwIfAborted();
    input.activity?.('Downloading Creator Kit and installing dependencies');
    input.telemetry?.record('kit_update_started');
    stage = mkdtempSync(join(state, 'kit-stage-'));
    copyFileSync(kitPath(root, 'setup.mjs'), join(stage, 'setup.mjs'));
    const ignore = kitPath(root, '.gitignore');
    if (existsSync(ignore)) copyFileSync(ignore, join(stage, '.gitignore'));
    writeFileSync(join(stage, 'gamedev.lock'), JSON.stringify(lock), { mode: 0o600 });
    await prepareWorkspace({ cwd: stage, env: input.env, abort: input.abort, write: input.write });
    input.abort?.throwIfAborted();
    const prepared = JSON.parse(readFileSync(kitPath(stage, '.gamedev/kit-manifest.json'), 'utf8')) as Partial<KitLock>;
    if (prepared.engineRef !== lock.engineRef || prepared.kitSha256 !== lock.kitSha256)
      throw new CliError('Prepared Creator Kit does not match the requested release.', EXIT_REFUSED);
    input.activity?.('Installing the prepared Creator Kit');
    await startLocalPlay({ root, slug: lock.slug, env: input.env, write: input.write, stop: true, abort: input.abort });
    installPreparedKit(root, stage);
    stage = undefined;
    input.telemetry?.record('kit_update_completed');
    input.write(
      `Creator Kit updated to ${lock.engineRef.slice(0, 12)}. Your game edits are preserved. Use /play to restart the preview.`,
    );
  } catch (error) {
    input.telemetry?.record('kit_update_failed');
    throw error;
  } finally {
    if (stage && !existsSync(kitPath(root, '.gamedev/kit-update.json')))
      rmSync(stage, { recursive: true, force: true });
    rmSync(busy, { force: true });
  }
}

export async function offerKitUpdate(input: Input): Promise<void> {
  const release = await checkKit(input);
  if (release.current) {
    input.write('Creator Kit is up to date.');
    return;
  }
  input.telemetry?.record('kit_update_available');
  input.write(
    release.repair
      ? 'Creator Kit setup needs to be completed. Your local game edits will be kept.'
      : 'A newer Creator Kit is available. Updating keeps your local game edits.',
  );
  if (!input.pick) {
    input.write('Run gamedevpl kit update to install it.');
    return;
  }
  const update = 'Update Creator Kit now';
  const choice = await input.pick([update, 'Later'], 'Update the game tools? Your local game edits will be kept.');
  if (choice !== update) {
    input.write('Keeping this Kit for now. Use /kit to update later.');
    return;
  }
  await updateKit({ ...input, release });
}
