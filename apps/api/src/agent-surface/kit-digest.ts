// Loads the immutable digest paired with the current Creator Kit.

import type { GcsObjectStore } from '../delivery/gcs-sign.js';
import { readFile } from 'node:fs/promises';

export const KIT_REGISTRY_OBJECT = 'kits/current.json';
// Sanity ceiling on raw digest bytes, not a prompt budget.
export const DEFAULT_KIT_DIGEST_MAX_BYTES = 250_000;
export const DEFAULT_PROMPT_DIGEST_MAX_BYTES = 20_000;
// Sized to an MCP tool-result ceiling, not the whole API.
export const DEFAULT_MCP_DIGEST_MAX_BYTES = 50_000;

// Fallback only — moduleFamiliesOf prefers the digest's own catalog.
const FALLBACK_MODULE_FAMILIES: readonly string[] = Object.freeze([
  'actors',
  'ai',
  'audio',
  'collision',
  'commons',
  'core',
  'drawing',
  'editor',
  'effects',
  'gameplay',
  'gfx3d',
  'gfx',
  'input',
  'mascot',
  'party',
  'path',
  'presence',
  'rng',
  'save',
  'sensing',
  'voice',
  'world',
  'zone',
]);

// Lifecycle declarations every game needs; kept before any module block.
const CORE_DECLARATIONS: readonly string[] = Object.freeze([
  'GameKitApi',
  'GameKitGameBuilder',
  'GameKitGameContext',
  'GameKit',
  'GameDefinition',
  'GameKitInput',
  'GameKitDraw',
  'GameKitRenderer',
  'GameKitSurface',
  'GameLifecycleState',
  'GameKitEndConfig',
  'GameKitHudSpec',
  'GameKitHudSlot',
  'GameKitGameText',
  'GameSnapshot',
  'GameSnapshotValue',
  'GameKitPointer',
]);

interface DeclarationBlock {
  name: string;
  text: string;
  bytes: number;
}

// Top-level declarations start at column 0, ending at the next.
export function splitDeclarationBlocks(api: string): DeclarationBlock[] {
  const lines = api.split('\n');
  const starts: number[] = [];
  const names: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match =
      /^(?:export\s+)?(?:declare\s+)?(?:interface|type|const|class|enum|function|namespace)\s+([A-Za-z_$][\w$]*)/.exec(
        lines[i],
      );
    if (match) {
      starts.push(i);
      names.push(match[1]);
    }
  }
  return starts.map((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1] : lines.length;
    const text = lines.slice(start, end).join('\n').replace(/\s+$/, '');
    return { name: names[index], text, bytes: Buffer.byteLength(`${text}\n`, 'utf8') };
  });
}

// Tracks bracket depth, not indentation (see SKILL.md for the bug fixed).
function splitMembers(body: string): Array<{ text: string; bytes: number }> {
  const lines = body.split('\n');
  const starts: number[] = [];
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (depth === 0 && /\S/.test(line)) starts.push(i);
    for (const ch of line) {
      if (ch === '{' || ch === '(' || ch === '[') depth++;
      else if (ch === '}' || ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    }
  }
  if (!starts.length) return [];
  return starts.map((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1] : lines.length;
    const text = lines.slice(start, end).join('\n').replace(/\s+$/, '');
    return { text, bytes: Buffer.byteLength(`${text}\n`, 'utf8') };
  });
}

// Abridge an oversized declaration member-wise (factories first) instead of dropping it.
function elideDeclaration(
  block: DeclarationBlock,
  maxBytes: number,
  families: readonly string[],
): DeclarationBlock | undefined {
  const lines = block.text.split('\n');
  if (lines.length < 3) return undefined;
  const header = lines[0];
  const closer = lines[lines.length - 1];
  if (!/\{\s*$/.test(header) || !/^\}/.test(closer)) return undefined;
  const members = splitMembers(lines.slice(1, -1).join('\n'));
  if (!members.length) return undefined;

  const overhead = Buffer.byteLength(`${header}\n${closer}\n`, 'utf8');
  // Module-family factories outrank other factories — see byoca-mcp SKILL.md.
  const rankOf = (text: string): number => {
    const factory = /^\s*(?:readonly\s+)?create([A-Z]\w*)/.exec(text);
    if (!factory) return 2;
    return families.includes(factory[1].toLowerCase()) ? 0 : 1;
  };
  const ranked = members
    .map((member, index) => ({ member, index, rank: rankOf(member.text) }))
    .sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank));

  const chosen = new Set<number>();
  let used = overhead + 80; // room for the elision note itself
  for (const entry of ranked) {
    if (used + entry.member.bytes > maxBytes) continue;
    chosen.add(entry.index);
    used += entry.member.bytes;
  }
  if (!chosen.size) return undefined;

  const dropped = members.length - chosen.size;
  const body = members.filter((_, index) => chosen.has(index)).map((member) => member.text);
  if (dropped) body.push(`  // … ${dropped} more members omitted; read shared/game-kit.d.ts for the rest`);
  const text = [header, ...body, closer].join('\n');
  return { name: block.name, text, bytes: Buffer.byteLength(`${text}\n`, 'utf8') };
}

// Reserved headroom for the omission note (formatOmittedNote) inside the API budget.
const OMITTED_NOTE_RESERVE_BYTES = 600;

// Self-bounded omission note; see SKILL.md for why it matters.
export function formatOmittedNote(omitted: readonly string[], maxBytes: number): string {
  if (!omitted.length) return '';
  const prefix = `\n// Omitted for length (${omitted.length}); read shared/game-kit.d.ts for these: `;
  if (Buffer.byteLength(prefix, 'utf8') > maxBytes) return '';
  let text = prefix;
  let shown = 0;
  for (const name of omitted) {
    const candidate = `${text}${shown ? ', ' : ''}${name}`;
    if (Buffer.byteLength(candidate, 'utf8') > maxBytes) break;
    text = candidate;
    shown++;
  }
  const remaining = omitted.length - shown;
  if (remaining > 0) {
    const suffix = ` … and ${remaining} more`;
    text = Buffer.byteLength(`${text}${suffix}`, 'utf8') <= maxBytes ? `${text}${suffix}` : text;
  }
  return text;
}

// Module families from the digest's own catalog, or a fallback list.
function moduleFamiliesOf(digest: string): readonly string[] {
  const catalog = sectionOf(digest, '## Engine modules');
  if (!catalog) return FALLBACK_MODULE_FAMILIES;
  const found = new Set<string>();
  for (const line of catalog.split('\n')) {
    const match = /^[-*]\s+`?([a-z][a-z0-9]*)`?\s*(?:—|-|:)/.exec(line.trim());
    if (match) found.add(match[1]);
  }
  // Longest first so `gfx3d` claims its blocks before `gfx` can.
  return found.size ? [...found].sort((a, b) => b.length - a.length) : FALLBACK_MODULE_FAMILIES;
}

// The module family a declaration belongs to, by longest name match.
function familyOf(name: string, families: readonly string[]): string | undefined {
  const lower = name.toLowerCase();
  let best: string | undefined;
  for (const family of families) {
    if (lower.includes(family) && (!best || family.length > best.length)) best = family;
  }
  return best;
}

// Whole blocks, every family represented first (see SKILL.md for the bug).
export function selectApiBlocks(
  blocks: readonly DeclarationBlock[],
  families: readonly string[],
  maxBytes: number,
): { kept: DeclarationBlock[]; omitted: string[] } {
  const kept = new Map<string, DeclarationBlock>();
  let used = 0;
  const take = (block: DeclarationBlock, limit = maxBytes): boolean => {
    if (kept.has(block.name)) return true;
    if (used + block.bytes > limit) return false;
    kept.set(block.name, block);
    used += block.bytes;
    return true;
  };

  // Reserve a share up front for oversized core declarations like GameKitApi.
  const oversized = CORE_DECLARATIONS.map((name) => blocks.find((block) => block.name === name)).filter(
    (block): block is DeclarationBlock => Boolean(block) && block!.bytes > Math.floor(maxBytes * 0.45),
  );
  const reserve = oversized.length ? Math.floor(maxBytes * 0.45) : 0;
  const earlyLimit = maxBytes - reserve;

  // Families first, ahead of core, so one block cannot starve them.
  const claimed = new Set<string>();
  for (const family of families) {
    if (claimed.has(family)) continue;
    const candidates = blocks.filter((block) => familyOf(block.name, families) === family);
    if (!candidates.length) continue;
    const primary =
      candidates.find((block) => block.name.toLowerCase() === `gamekit${family}`) ??
      candidates.find((block) => block.name.toLowerCase() === family) ??
      candidates.reduce((shortest, block) => (block.name.length < shortest.name.length ? block : shortest));
    if (take(primary, earlyLimit)) claimed.add(family);
  }
  // Core that fits whole, in CORE_DECLARATIONS order (most-important first).
  for (const name of CORE_DECLARATIONS) {
    const block = blocks.find((candidate) => candidate.name === name);
    if (block && !oversized.includes(block)) take(block, earlyLimit);
  }
  // Spend the reserve: abridge oversized core declarations instead of dropping them.
  for (const block of oversized) {
    if (kept.has(block.name)) continue;
    if (take(block)) continue;
    const elided = elideDeclaration(block, maxBytes - used, families);
    if (elided) take(elided);
  }
  for (const block of blocks) take(block);

  const omitted = blocks.filter((block) => !kept.has(block.name)).map((block) => block.name);
  // Source order, using the stored (possibly abridged) copy, not the original.
  return { kept: blocks.filter((block) => kept.has(block.name)).map((block) => kept.get(block.name)!), omitted };
}

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

  const exemplarStart = digest.indexOf('## Exemplar game');
  const rulesStart = digest.indexOf('## File-shape rules');
  const exemplar = exemplarStart >= 0 ? digest.slice(exemplarStart, rulesStart >= 0 ? rulesStart : undefined) : '';
  // SPEC.md first — required every submit; shows its frontmatter shape.
  const exemplarFiles = [
    'SPEC.md',
    'GAME.json',
    'index.html',
    'game.ts',
    'game/model.ts',
    'game/render.ts',
    'game/runtime.ts',
  ];
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
  const engineModules = sectionOf(digest, '## Engine modules');
  const audioCatalog = sectionOf(digest, '## Audio catalog');

  // Measure the fixed shell first — a guessed percentage silently truncated rules.
  const shellBytes = Buffer.byteLength(
    [
      '# Creator Kit prompt digest',
      'Use these signatures and the template shape; unpack the full kit only when needed.',
      '',
      engineModules,
      '## Core API',
      '~~~typescript',
      '~~~',
      '',
      audioCatalog,
      exemplarSections.join('\n\n'),
      '',
      rules,
    ].join('\n'),
    'utf8',
  );
  // Reserve room for the omission note before selection spends the rest.
  const apiBudget = Math.max(0, maxBytes - shellBytes - OMITTED_NOTE_RESERVE_BYTES);
  const { kept, omitted } = selectApiBlocks(splitDeclarationBlocks(api), moduleFamiliesOf(digest), apiBudget);
  const apiLines = kept.map((block) => block.text);
  // Name what got cut instead of dropping it silently.
  const omittedNote = formatOmittedNote(omitted, OMITTED_NOTE_RESERVE_BYTES);
  if (omittedNote) apiLines.push(omittedNote);

  const compact = [
    '# Creator Kit prompt digest',
    'Use these signatures and the template shape; unpack the full kit only when needed.',
    '',
    // Ahead of the API: what this platform can build.
    engineModules,
    '## Core API',
    '~~~typescript',
    apiLines.join('\n'),
    '~~~',
    '',
    // Before the exemplar: the tail is what a byte cap cuts.
    audioCatalog,
    exemplarSections.join('\n\n'),
    '',
    rules,
  ].join('\n');
  // Floor only — fires when the shell alone exceeds maxBytes (zero API lines).
  return Buffer.byteLength(compact, 'utf8') <= maxBytes
    ? compact
    : Buffer.from(compact, 'utf8').subarray(0, maxBytes).toString('utf8');
}

// get_kit_api's digest: same shape, a per-round budget.
export function compactKitDigestForApi(digest: string, maxBytes = DEFAULT_MCP_DIGEST_MAX_BYTES): string {
  return compactKitDigestForPrompt(digest, maxBytes);
}
