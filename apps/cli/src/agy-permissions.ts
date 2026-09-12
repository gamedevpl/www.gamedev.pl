import { lstat, stat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import type { PickChoice, Workshop } from './workshop.js';

const ENABLE = 'Enable sandboxed headless mode (remember for agy)';
const CURRENT = 'Use current agy permissions for this run';
const CANCEL = 'Return without starting';

type Settings = Record<string, unknown>;

async function snapshot(path: string, followSymlink = false): Promise<string | undefined> {
  try {
    const entry = await lstat(path);
    const info = followSymlink && entry.isSymbolicLink() ? await stat(path) : entry;
    if (!info.isFile()) throw new Error('not a regular settings file');
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new CliError('Cannot safely read Antigravity settings.', EXIT_REFUSED, 'check agy settings.json');
  }
}

function decode(raw: string | undefined): Settings {
  if (raw === undefined) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid settings');
    return value as Settings;
  } catch {
    throw new CliError('Antigravity settings.json is invalid; left unchanged.', EXIT_REFUSED);
  }
}

export async function setupAgyPermissions(input: {
  env: NodeJS.ProcessEnv;
  pick: PickChoice;
  write: (line: string) => void;
  abort: AbortSignal;
  unattended?: boolean;
  platform?: NodeJS.Platform;
}): Promise<boolean> {
  if (input.abort.aborted) return false;
  if (!['darwin', 'linux'].includes(input.platform ?? process.platform)) {
    input.write('Antigravity sandbox setup is available on macOS and Linux; using existing permissions.');
    return true;
  }
  const path = join(input.env.HOME ?? homedir(), '.gemini', 'antigravity-cli', 'settings.json');
  const raw = await snapshot(path, true);
  const settings = decode(raw);
  if (settings.toolPermission === 'proceed-in-sandbox' && settings.enableTerminalSandbox === true) {
    input.write('Antigravity: sandboxed headless mode. Existing permission rules still apply.');
    return true;
  }
  if (input.unattended) {
    input.write('Antigravity: using existing permissions; unattended runs do not change agy settings.');
    return true;
  }
  input.write(
    'Antigravity can run commands without prompts inside its sandbox. Setup changes global agy settings for all projects, not just this game.',
  );
  input.write(
    'Sets enableTerminalSandbox=true and toolPermission=proceed-in-sandbox. Existing allow/ask/deny rules, including any outside-sandbox exceptions, remain unchanged. A backup is saved.',
  );
  const choice = await input.pick([ENABLE, CURRENT, CANCEL], 'How should Antigravity handle permissions?');
  if (input.abort.aborted || choice === CANCEL) return false;
  if (choice === CURRENT) return true;
  if (choice !== ENABLE) return false;
  await mkdir(dirname(path), { recursive: true });
  const suffix = randomUUID();
  const temporary = `${path}.${suffix}.tmp`;
  const backup = `${path}.gamedevpl-${suffix}.bak`;
  try {
    await writeFile(
      temporary,
      JSON.stringify({ ...settings, enableTerminalSandbox: true, toolPermission: 'proceed-in-sandbox' }, null, 2) +
        '\n',
      { flag: 'wx', mode: 0o600 },
    );
    if ((await snapshot(path)) !== raw)
      throw new CliError('Antigravity settings changed during setup; retry before starting.', EXIT_REFUSED);
    if (input.abort.aborted) return false;
    if (raw !== undefined) await writeFile(backup, raw, { flag: 'wx', mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => {});
  }
  input.write('Antigravity: sandboxed headless mode enabled and remembered. Existing permission rules still apply.');
  input.write(raw === undefined ? `Settings: ${path}` : `Previous settings backup: ${backup}`);
  return true;
}

export async function prepareAgyPermissions(
  ws: Workshop,
  adapter: string,
  write: (line: string) => void,
  abort: AbortSignal,
): Promise<boolean> {
  if (adapter !== 'agy' || ws.runAdapter) return true;
  return setupAgyPermissions({ env: ws.env, pick: ws.pick, write, abort, unattended: !!ws.unattended });
}
