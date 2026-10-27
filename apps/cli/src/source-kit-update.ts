import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { kitPath } from './kit-install.js';
import { prepareWorkspace } from './prepare-workspace.js';
import { startLocalPlay } from './play.js';
import type { CliTelemetry } from './telemetry.js';

export async function updateSourceKit(input: {
  root: string;
  lock: { slug: string; engineRef: string; kitSha256: string };
  env: NodeJS.ProcessEnv;
  abort?: AbortSignal;
  write: (line: string) => void;
  telemetry?: CliTelemetry;
}): Promise<void> {
  const { root, lock } = input;
  input.abort?.throwIfAborted();
  const pin = kitPath(root, 'gamedev-kit.json');
  const original = readFileSync(pin, 'utf8');
  const runtime = kitPath(root, '.gamedev/local');
  mkdirSync(kitPath(root, '.gamedev'), { recursive: true });
  await startLocalPlay({ root, slug: lock.slug, env: input.env, write: input.write, stop: true, abort: input.abort });
  const backup = mkdtempSync(kitPath(root, '.gamedev/kit-backup-'));
  writeFileSync(join(backup, 'gamedev-kit.json'), original, { mode: 0o600 });
  const saved = join(backup, 'local');
  const hadRuntime = existsSync(runtime);
  if (hadRuntime) renameSync(runtime, saved);
  let restoredOrInstalled = false;
  try {
    input.telemetry?.record('kit_update_started');
    writeFileSync(
      pin,
      JSON.stringify({ ...JSON.parse(original), engineRef: lock.engineRef, kitSha256: lock.kitSha256 }, null, 2) + '\n',
    );
    await prepareWorkspace({ cwd: root, env: input.env, abort: input.abort, write: input.write });
    input.abort?.throwIfAborted();
    restoredOrInstalled = true;
    input.telemetry?.record('kit_update_completed');
  } catch (error) {
    writeFileSync(pin, original);
    rmSync(runtime, { recursive: true, force: true });
    if (hadRuntime) renameSync(saved, runtime);
    restoredOrInstalled = true;
    input.telemetry?.record('kit_update_failed');
    throw error;
  } finally {
    if (restoredOrInstalled) rmSync(backup, { recursive: true, force: true });
  }
  input.write(
    `Creator Kit updated to ${lock.engineRef.slice(0, 12)}. Game sources are preserved. Use /play to restart the preview.`,
  );
}
