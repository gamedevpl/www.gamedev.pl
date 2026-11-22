import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ApiClient } from './api.js';
import { kitPath } from './kit-install.js';

function readEngineRef(path: string): string | null {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as { engineRef?: unknown };
    const ref = typeof value.engineRef === 'string' ? value.engineRef : '';
    return /^[a-f0-9]{40}$/i.test(ref) ? ref : null;
  } catch {
    return null;
  }
}

function localKitRef(dest: string): string | null {
  const sourcePin = join(dest, 'gamedev-kit.json');
  if (existsSync(sourcePin)) return readEngineRef(sourcePin);
  return readEngineRef(kitPath(dest, 'gamedev.lock'));
}

// Server typechecks the round pin, or current when unpinned.
export async function warnIfKitStale(input: {
  api: ApiClient;
  slug: string;
  dest: string;
  warn?: (line: string) => void;
}): Promise<void> {
  if (!input.warn) return;
  const local = localKitRef(input.dest);
  if (!local) return;
  try {
    const pending = input.api
      .request<{ engineRef?: unknown; typecheckEngineRef?: unknown }>(
        'GET',
        `/api/me/studio/games/${input.slug}/workspace?kitOnly=true`,
      )
      .catch(() => null);
    const lock = await Promise.race([pending, new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000))]);
    const hex = (value: unknown) => (typeof value === 'string' && /^[a-f0-9]{7,64}$/i.test(value) ? value : '');
    const current = hex(lock?.engineRef);
    const target = hex(lock?.typecheckEngineRef) || current;
    if (!target || target.toLowerCase() === local.toLowerCase()) return;
    const short = (ref: string) => ref.slice(0, 12);
    const follow =
      current && target.toLowerCase() === current.toLowerCase()
        ? ' Update before sending: gamedevpl kit update'
        : ' This round keeps that Kit until it closes.';
    input.warn(
      `Warning: this checkout pins GameKit ${short(local)}, but the platform typechecks ${short(target)}. A local pass can still be refused.${follow}`,
    );
  } catch {
    // A kit probe must not block delivery.
  }
}
