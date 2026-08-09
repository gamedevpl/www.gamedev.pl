// Loads the immutable digest paired with the current Creator Kit.

import type { GcsObjectStore } from './gcs-sign.js';
import { readFile } from 'node:fs/promises';

export const KIT_REGISTRY_OBJECT = 'kits/current.json';
export const DEFAULT_KIT_DIGEST_MAX_BYTES = 100_000;
export const DEFAULT_PROMPT_DIGEST_MAX_BYTES = 20_000;

export interface KitDigestLoader {
  load(): Promise<string | undefined>;
}

export function createGcsKitDigestLoader(options: {
  objectStore: Pick<GcsObjectStore, 'readObject'>;
  maxBytes?: number;
  log?: (context: object, message: string) => void;
}): KitDigestLoader {
  let cached: string | undefined;
  let resolved = false;
  return {
    async load(): Promise<string | undefined> {
      if (resolved) return cached;
      try {
        const registryBody = await options.objectStore.readObject(KIT_REGISTRY_OBJECT);
        if (!registryBody) {
          resolved = true;
          return undefined;
        }
        const registry = JSON.parse(registryBody.toString('utf8')) as { engineRef?: unknown };
        if (typeof registry.engineRef !== 'string' || !registry.engineRef) {
          resolved = true;
          return undefined;
        }
        const digestBody = await options.objectStore.readObject(`kits/${registry.engineRef}.digest.md`);
        if (!digestBody) {
          resolved = true;
          return undefined;
        }
        const maxBytes = options.maxBytes ?? DEFAULT_KIT_DIGEST_MAX_BYTES;
        if (digestBody.byteLength > maxBytes) {
          throw new Error(`Creator Kit digest exceeds ${maxBytes} bytes`);
        }
        cached = digestBody.toString('utf8');
        resolved = true;
        return cached;
      } catch (error) {
        options.log?.({ err: error }, 'could not load the Creator Kit digest');
        return undefined;
      }
    },
  };
}

export function appendKitDigest(base: string | undefined, digest: string | undefined): string | undefined {
  if (!digest) return base;
  return [base?.trim(), '## Creator Kit digest', compactKitDigestForPrompt(digest)].filter(Boolean).join('\n\n');
}

export function createFileKitDigestLoader(path: string): KitDigestLoader {
  let cached: string | undefined;
  return {
    async load(): Promise<string | undefined> {
      if (cached !== undefined) return cached;
      cached = await readFile(path, 'utf8');
      return cached;
    },
  };
}

function sectionOf(digest: string, heading: string): string {
  const start = digest.indexOf(heading);
  if (start < 0) return '';
  const next = digest.indexOf('\n## ', start + heading.length);
  return `${digest.slice(start, next >= 0 ? next : digest.length).trim()}\n`;
}

export function compactKitDigestForPrompt(digest: string, maxBytes = DEFAULT_PROMPT_DIGEST_MAX_BYTES): string {
  if (!digest.includes('## GameKit API surface') && !digest.includes('## Exemplar game')) {
    return digest.trim();
  }
  const apiStart = digest.indexOf('~~~typescript');
  const apiEnd = apiStart < 0 ? -1 : digest.indexOf('~~~', apiStart + 13);
  const api = apiStart >= 0 && apiEnd >= 0 ? digest.slice(apiStart + 13, apiEnd) : '';
  const apiPatterns = [
    /GameKit(Input|GameContext|GameBuilder|Api|Draw)/,
    /GameLifecycleState|GameKitEndConfig|GameKitHudSpec/,
    /create(Renderer|Input|Audio)|defineGame/,
    /orientation\(|renderer\(|input\(|audio\(|init\(|win\(|lose\(|hud\(|update\(|render\(|snapshot\(|start\(/,
    /down\(|consume(Real|Press|Click)|position\(|held\(|vector\(/,
    /end(Soon)?\(|restart\(|clear\(|rect\(|circle\(|poly\(|text\(|line\(/,
  ];
  const apiLines = api
    .split('\n')
    .filter((line) => apiPatterns.some((pattern) => pattern.test(line)))
    .slice(0, 180);

  const exemplarStart = digest.indexOf('## Exemplar game');
  const rulesStart = digest.indexOf('## File-shape rules');
  const exemplar = exemplarStart >= 0 ? digest.slice(exemplarStart, rulesStart >= 0 ? rulesStart : undefined) : '';
  const exemplarFiles = ['GAME.json', 'index.html', 'game.ts', 'game/model.ts', 'game/render.ts', 'game/runtime.ts'];
  const exemplarSections = exemplarFiles
    .map((file) => {
      const marker = `### games/dodge-the-falling-rocks/${file}`;
      const start = exemplar.indexOf(marker);
      if (start < 0) return '';
      const next = exemplar.indexOf('\n### ', start + marker.length);
      return exemplar.slice(start, next >= 0 ? next : exemplar.length);
    })
    .filter(Boolean);
  const rules = rulesStart >= 0 ? digest.slice(rulesStart) : '';
  const compact = [
    '# Creator Kit prompt digest',
    'Use these signatures and the template shape; unpack the full kit only when needed.',
    '',
    '## Core API',
    '~~~typescript',
    apiLines.join('\n'),
    '~~~',
    '',
    // Before the exemplar: the tail is what a byte cap cuts.
    sectionOf(digest, '## Audio catalog'),
    exemplarSections.join('\n\n'),
    '',
    rules,
  ].join('\n');
  return Buffer.byteLength(compact, 'utf8') <= maxBytes
    ? compact
    : Buffer.from(compact, 'utf8').subarray(0, maxBytes).toString('utf8');
}
