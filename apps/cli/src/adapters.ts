import {
  accessSync,
  closeSync,
  constants,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import bundled from './adapters.json' with { type: 'json' };

export interface AdapterSpec {
  name: string;
  command: string;
  versionFlag: string;
  headless: string[];
  events: { flag: string; dialect: 'ndjson' | 'jsonl' };
  budget?: { turns?: string; price?: string };
  cwd: 'game-dir' | 'workspace';
  exit: { success: number[]; failure: number[] };
}

export interface AdapterFile {
  version: number;
  adapters: AdapterSpec[];
}

function shippedAdapters(): AdapterFile {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, 'adapters.json'),
    join(here, '..', 'adapters.json'),
    join(dirname(process.execPath), 'adapters.json'),
  ];
  const found = candidates.find((path) => existsSync(path));
  if (found) return JSON.parse(readFileSync(found, 'utf8')) as AdapterFile;
  return bundled as AdapterFile;
}

export function loadAdapters(env: NodeJS.ProcessEnv = process.env): AdapterFile {
  const shipped = shippedAdapters();
  const customPath = env.GAMEDEV_ADAPTERS ?? join(env.HOME ?? homedir(), '.config', 'gamedevpl', 'adapters.json');
  try {
    const extra = JSON.parse(readFileSync(customPath, 'utf8')) as { adapters?: AdapterSpec[] };
    if (extra.adapters?.length) {
      return { version: shipped.version, adapters: [...shipped.adapters, ...extra.adapters] };
    }
  } catch {
    // custom file is optional and unsupported
  }
  return shipped;
}

export function detectAdapter(
  name: string,
  which: (cmd: string) => string | null,
  file = loadAdapters(),
): AdapterSpec | null {
  const spec = file.adapters.find((row) => row.name === name);
  if (!spec) return null;
  if (which(spec.command)) return spec;
  if (name === 'cursor') {
    const alias = which('agent');
    if (alias) {
      const help = probeHelp(alias, ['--help'], process.env);
      if (help && /cursor/i.test(help)) return { ...spec, command: alias };
    }
  }
  return null;
}

export function preflightAdapter(spec: AdapterSpec, env: NodeJS.ProcessEnv): void {
  const args = ['codex', 'muse'].includes(spec.name) ? ['exec', '--help'] : ['--help'];
  const help = probeHelp(spec.command, args, env);
  if (help === null) {
    throw new CliError(`cannot run ${spec.name} --help`, EXIT_REFUSED, `check ${spec.command} in your terminal`);
  }
  const flags = spec.headless.filter((arg) => arg.startsWith('-')).map((arg) => arg.split('=')[0]!);
  const missing = flags.filter((flag) => !help.includes(flag));
  if (missing.length)
    throw new CliError(
      `${spec.name} does not support ${missing.join(', ')}`,
      EXIT_REFUSED,
      `update ${spec.name} or choose another agent`,
    );
}

function probeHelp(command: string, args: string[], env: NodeJS.ProcessEnv): string | null {
  const dir = mkdtempSync(join(tmpdir(), 'gamedev-agent-help-'));
  const path = join(dir, 'help.txt');
  const fd = openSync(path, 'w', 0o600);
  try {
    // Some CLIs exit before pipe buffers flush; files preserve their help.
    const result = spawnSync(command, args, { env, timeout: 10_000, stdio: ['ignore', fd, fd] });
    if (result.error || result.status !== 0 || statSync(path).size > 1024 * 1024) return null;
    return readFileSync(path, 'utf8');
  } finally {
    closeSync(fd);
    rmSync(dir, { recursive: true, force: true });
  }
}

export function whichOnPath(cmd: string, env: NodeJS.ProcessEnv = process.env): string | null {
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, cmd);
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      continue;
    }
  }
  return null;
}
