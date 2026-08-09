// Loads the immutable digest paired with the current Creator Kit.

import type { GcsObjectStore } from './gcs-sign.js';
import { readFile } from 'node:fs/promises';

export const KIT_REGISTRY_OBJECT = 'kits/current.json';
/**
 * Sanity ceiling on the raw stored digest (comment-stripped API + exemplar + rules; not
 * the prompt-compacted size), not a token budget — `compactKitDigestForPrompt` /
 * `compactKitDigestForApi` own that. Raised from 100_000: the games repo's own digest
 * was already at 99,552 bytes — 99.5% of that cap — before it grew a `## Engine modules`
 * catalog, so the ceiling was one small API addition from failing regardless of this
 * change. 150_000 restores real headroom.
 */
export const DEFAULT_KIT_DIGEST_MAX_BYTES = 150_000;
export const DEFAULT_PROMPT_DIGEST_MAX_BYTES = 20_000;
/**
 * `get_kit_api` is opt-in and paid once per round by an agent that has decided it needs
 * the API, so it can afford far more than a system prompt injected into every platform
 * run. Sized to carry the whole declaration surface of a current kit (~79 KiB stripped)
 * with headroom, so the MCP lane rarely has to omit anything at all.
 */
export const DEFAULT_MCP_DIGEST_MAX_BYTES = 90_000;

/**
 * Engine module families for kits published before the digest carried its own
 * `## Engine modules` catalog. Only a fallback: `moduleFamiliesOf` prefers the catalog,
 * which is generated from `shared/modules/*.ts` in the games repo and cannot go stale.
 */
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

/**
 * Declarations that describe the lifecycle every game uses regardless of module choice.
 * These are kept before any module block, because a digest that dropped them would not
 * describe a buildable game at all.
 */
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

/**
 * Split a `.d.ts` body into top-level declaration blocks.
 *
 * The kit's declaration file puts every top-level declaration at column 0 and indents
 * everything nested, so a block runs from one column-0 declaration to the next. That is
 * why this does not count braces: it costs nothing in accuracy here and cannot desync on
 * a brace inside a string literal or a template type.
 */
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

/**
 * Split the body of a declaration into its members.
 *
 * Same column trick as `splitDeclarationBlocks`, one level in: a member starts at the
 * first indent and runs to the next one, so a multi-line member (`createZone<S>(config: {
 * … })`) stays whole instead of being cut mid-signature.
 */
function splitMembers(body: string): Array<{ text: string; bytes: number }> {
  const lines = body.split('\n');
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s+\S/.test(lines[i]) && /^ {1,2}\S/.test(lines[i])) starts.push(i);
  }
  if (!starts.length) return [];
  return starts.map((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1] : lines.length;
    const text = lines.slice(start, end).join('\n').replace(/\s+$/, '');
    return { text, bytes: Buffer.byteLength(`${text}\n`, 'utf8') };
  });
}

/**
 * Shrink one oversized declaration to fit, by dropping members rather than the whole
 * declaration.
 *
 * `GameKitApi` is 34 KiB — 44% of the entire declaration surface in a single interface —
 * and `createParty`, `createZone`, `createCommons` and `createPresence` are members of it,
 * near its end. Whole-block selection alone therefore had a sharp edge: below a ~40 KiB API
 * budget `GameKitApi` did not fit at all and every module factory vanished with it, and any
 * naive truncation would have cut precisely the tail those four live in. Factories are kept
 * first for that reason, and what is dropped is counted in place, inside the braces, so the
 * result reads as an abridged interface rather than a complete one.
 */
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
  // Rank module factories above other factories, not just factories above everything.
  // `GameKitApi` carries dozens of `create*` members — the gfx3d geometry/material/mesh
  // family alone is most of them — and `createParty` / `createZone` / `createCommons` /
  // `createPresence` are declared last. Ranking factories only by source order therefore
  // still spent the whole reserve before reaching them.
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

/** Module families named by the digest's own catalog, falling back for older kits. */
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

/** The module family a declaration belongs to, by longest name match. */
function familyOf(name: string, families: readonly string[]): string | undefined {
  const lower = name.toLowerCase();
  let best: string | undefined;
  for (const family of families) {
    if (lower.includes(family) && (!best || family.length > best.length)) best = family;
  }
  return best;
}

/**
 * Choose which declaration blocks survive a byte budget.
 *
 * Selection is tiered rather than filtered, and the tiers exist for one reason: an earlier
 * implementation kept only lines matching a hardcoded regex allowlist, every pattern of
 * which described single-player core API. `GameKitParty`, `GameKitZone`, `GameKitCommons`
 * and `GameKitPresence` matched nothing, so party games, real-time shared zones and
 * persistent worlds — three of the platform's most differentiated capabilities — were
 * invisible to the platform agent reading this digest, with no signal that anything had
 * been removed. The only survivor was an accident: `down(` was meant for input and pulled
 * in party's `down(slot, ...actions)` as an orphan line with its interface name filtered
 * away, which is worse than omitting it.
 *
 * So: whole blocks only (never an orphan member line), every module family represented
 * before any family gets a second block, and whatever the budget forces out is named in
 * the output instead of vanishing.
 */
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

  // Reserve a share up front for core declarations too large to fit whole, instead of
  // letting them have only what earlier passes leave behind. `GameKitApi` is the only such
  // block today, and it is where every module factory lives, so "whatever is left over"
  // meant the factories were funded last from an empty purse: at a 14 KiB API budget the
  // earlier passes spent everything and `createParty` / `createZone` / `createCommons` /
  // `createPresence` never appeared at all.
  const oversized = CORE_DECLARATIONS.map((name) => blocks.find((block) => block.name === name)).filter(
    (block): block is DeclarationBlock => Boolean(block) && block!.bytes > Math.floor(maxBytes * 0.45),
  );
  const reserve = oversized.length ? Math.floor(maxBytes * 0.45) : 0;
  const earlyLimit = maxBytes - reserve;

  // Families first, and deliberately ahead of core. Every family primary together costs a
  // few KiB, while one core declaration (`GameKitApi`) costs 34 KiB; letting the big block
  // bid first is what made party, zone, commons and presence disappear below a ~40 KiB
  // budget. The block chosen per family is its primary declaration — `GameKitParty`, not
  // whichever of `PartyAction` / `PartySlotConfig` / `PartySlot` comes first in the file.
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
  // Then core that fits whole, in CORE_DECLARATIONS order rather than source order: that
  // list is written most-important first.
  for (const name of CORE_DECLARATIONS) {
    const block = blocks.find((candidate) => candidate.name === name);
    if (block && !oversized.includes(block)) take(block, earlyLimit);
  }
  // Now spend the reserve: abridge the oversized core declarations member-wise rather than
  // dropping them, so `GameKitApi` still contributes its factory signatures.
  for (const block of oversized) {
    if (kept.has(block.name)) continue;
    if (take(block)) continue;
    const elided = elideDeclaration(block, maxBytes - used, families);
    if (elided) take(elided);
  }
  for (const block of blocks) take(block);

  const omitted = blocks.filter((block) => !kept.has(block.name)).map((block) => block.name);
  // Emit in source order, taking the stored copy rather than the original: a block that
  // was abridged must reach the output abridged, not restored to full size.
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
  // The API section gets the lion's share; the catalog, exemplar and rules are small and
  // fixed, so reserving a slice for them keeps the tail from being what a cap truncates.
  const apiBudget = Math.max(0, Math.floor(maxBytes * 0.72));
  const { kept, omitted } = selectApiBlocks(splitDeclarationBlocks(api), moduleFamiliesOf(digest), apiBudget);
  const apiLines = kept.map((block) => block.text);
  // Name what the budget removed. A digest that silently drops declarations reads as a
  // complete API reference, and an agent cannot ask for what it cannot see is missing.
  if (omitted.length) {
    apiLines.push(
      `\n// Omitted for length (${omitted.length}); read shared/game-kit.d.ts for these: ${omitted.join(', ')}`,
    );
  }

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
    // First, and ahead of the API: this is the only place that answers "what can this
    // platform build at all" — the question that used to send agents to a web search.
    sectionOf(digest, '## Engine modules'),
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

/**
 * The same digest for `get_kit_api` over MCP, where the budget is per-round and opt-in
 * rather than per-prompt. Distinct from the platform lane only in size: an MCP agent has
 * no system prompt carrying the kit, so this is the whole reference it gets before it
 * falls back to the browse tools.
 */
export function compactKitDigestForApi(digest: string, maxBytes = DEFAULT_MCP_DIGEST_MAX_BYTES): string {
  return compactKitDigestForPrompt(digest, maxBytes);
}
