import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceDir = fileURLToPath(new URL('.', import.meta.url));
const serviceWorkerOnly = new Set(['shellUpdate.ts', 'AppUpdateBanner.tsx']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

function unguardedListeners(source: string): number[] {
  const missing: number[] = [];
  const registration = /window\.addEventListener\(['"]message['"],\s*onMessage\)/g;
  for (const match of source.matchAll(registration)) {
    const before = source.slice(0, match.index);
    const start = Math.max(
      before.lastIndexOf('function onMessage(event: MessageEvent)'),
      before.lastIndexOf('const onMessage = (event: MessageEvent) =>'),
    );
    const handler = start < 0 ? '' : before.slice(start);
    if (/isFromGameFrame\(event,/.test(handler) || /event\.source\s*!==[^\n]*\.contentWindow/.test(handler)) {
      continue;
    }
    missing.push(before.split('\n').length);
  }
  return missing;
}

describe('window game message listeners', () => {
  it('binds every listener to its frame', () => {
    const missing = sourceFiles(sourceDir).flatMap((path) => {
      if (serviceWorkerOnly.has(path.split('/').at(-1)!)) return [];
      return unguardedListeners(readFileSync(path, 'utf8')).map((line) => `${path}:${line}`);
    });
    expect(missing).toEqual([]);
  });

  it('reports a listener when its check is removed', () => {
    const source = readFileSync(join(sourceDir, 'gamePlayer.ts'), 'utf8');
    const withoutCheck = source.replace('if (!isFromGameFrame(event, contentWindow)) return;', '');
    expect(unguardedListeners(source)).toEqual([]);
    expect(unguardedListeners(withoutCheck)).toHaveLength(1);
  });
});
