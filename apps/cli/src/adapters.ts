import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  return which(spec.command) ? spec : null;
}

export function whichOnPath(cmd: string, env: NodeJS.ProcessEnv = process.env): string | null {
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, cmd);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}
