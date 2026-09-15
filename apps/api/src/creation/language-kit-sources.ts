import type { KitTree } from '../agent-surface/kit-files.js';
import { sharedSourcesFromKitTree } from './typecheck-preflight.js';

const HEAVY_PREFIXES = ['shared/modules/', 'shared/verticals/'];

export function languageKitSources(shared: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rel, source] of Object.entries(shared)) {
    if (rel === 'shared/game-kit.d.ts') continue;
    if (HEAVY_PREFIXES.some((prefix) => rel.startsWith(prefix))) continue;
    out[rel] = source;
  }
  return out;
}

export function studioKitFromTree(tree: KitTree): {
  declaration: string | null;
  files: Record<string, string>;
} {
  const shared = sharedSourcesFromKitTree(tree);
  return { declaration: shared['shared/game-kit.d.ts'] ?? null, files: languageKitSources(shared) };
}
