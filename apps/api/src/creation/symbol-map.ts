/**
 * A game's regions, small enough to put in a prompt.
 *
 * Call 1 of the code lane picks *where* an edit goes; this is what it picks
 * from. The whole point is that the model never sees the game — a 1,000-line
 * game is ~12k tokens, a map of it is a few hundred — so the expensive call
 * carries one function instead of a codebase.
 *
 * Deliberately regex-shaped rather than a TypeScript parse. Games are written
 * to a house style (top-level `export function` / `export const` / `function`
 * in a handful of files, no classes, no decorators), the map only needs to be
 * good enough to name a region and slice it back out, and a wrong guess is
 * caught immediately by the rebuild — a compile error, not a bad edit that
 * ships. Pulling `typescript` in to be exact would cost a dependency and
 * startup memory on the serve path for no reachable gain.
 *
 * Computed on demand and cached by (slug, version): a map is cheap to derive
 * and would otherwise be a new file in the delivery contract, the store, and
 * the gate — three moving parts for something recomputable in milliseconds.
 * Promoting it to a build artifact is a later optimization, not a prerequisite.
 */

/** Ceilings, so one pathological game cannot make an unbounded prompt. */
export const MAX_REGIONS = 60;
export const MAX_REGION_LINES = 400;

export interface SymbolRegion {
  /** Game-relative file, e.g. `game/runtime.ts`. */
  file: string;
  /** Declared name, or `<file>` for a whole file with no top-level declarations. */
  name: string;
  /** 1-based inclusive line span within the file. */
  startLine: number;
  endLine: number;
  /** The line that introduced it — enough for a model to know what it is. */
  signature: string;
  /** Leading line- or block-comment text, trimmed to one line, when present. */
  doc?: string;
}

const DECLARATION =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/;

/** Strip comment syntax so a doc line reads as prose in the prompt. */
function cleanDoc(lines: string[]): string | undefined {
  const text = lines
    .map((line) =>
      line
        .replace(/^\s*\/\*\*?/, '')
        .replace(/\*\/\s*$/, '')
        .replace(/^\s*\*\s?/, '')
        .replace(/^\s*\/\/\s?/, '')
        .trim(),
    )
    .filter((line) => line.length > 0)
    .join(' ')
    .trim();
  if (!text) return undefined;
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

/**
 * Split one file into top-level regions.
 *
 * A region runs from its declaration (including the comment block above it) to
 * the line before the next top-level declaration, so the slices tile the file
 * exactly and a replacement can be spliced back by line number alone. Anything
 * before the first declaration — imports, module constants — is its own
 * `<imports>` region so the map covers every line rather than quietly hiding
 * some.
 */
export function fileRegions(file: string, source: string): SymbolRegion[] {
  const lines = source.split('\n');
  const starts: Array<{ index: number; name: string; docFrom: number }> = [];
  let commentFrom: number | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      commentFrom ??= index;
      continue;
    }
    if (trimmed.length === 0) {
      // A blank line ends a comment block's association with what follows.
      if (commentFrom !== null && index > 0 && lines[index - 1].trim().startsWith('*/')) commentFrom = null;
      continue;
    }
    const match = DECLARATION.exec(line);
    if (match && !line.startsWith(' ') && !line.startsWith('\t')) {
      starts.push({ index, name: match[1], docFrom: commentFrom ?? index });
    }
    commentFrom = null;
  }

  if (starts.length === 0) {
    return [
      {
        file,
        name: '<file>',
        startLine: 1,
        endLine: lines.length,
        signature:
          lines
            .find((line) => line.trim().length > 0)
            ?.trim()
            .slice(0, 120) ?? '',
      },
    ];
  }

  const regions: SymbolRegion[] = [];
  const firstBody = starts[0].docFrom;
  if (firstBody > 0) {
    regions.push({
      file,
      name: '<imports>',
      startLine: 1,
      endLine: firstBody,
      signature: 'imports and module-level setup',
    });
  }
  for (const [order, start] of starts.entries()) {
    const next = starts[order + 1];
    const endLine = next ? next.docFrom : lines.length;
    const doc = cleanDoc(lines.slice(start.docFrom, start.index));
    regions.push({
      file,
      name: start.name,
      startLine: start.docFrom + 1,
      endLine,
      signature: lines[start.index].trim().slice(0, 120),
      ...(doc ? { doc } : {}),
    });
  }
  return regions;
}

/**
 * The whole game as regions, largest files first so the ceiling keeps the
 * places an edit is most likely to belong.
 */
export function buildSymbolMap(sources: Record<string, string>): SymbolRegion[] {
  const files = Object.keys(sources)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
    // The generated content module is machine-written from EDITOR.json; an edit
    // to it would be overwritten by the next regeneration, so it is not a place
    // the code lane may target.
    .filter((file) => file !== 'game/editor-content.ts')
    .sort((a, b) => sources[b].length - sources[a].length);

  const regions: SymbolRegion[] = [];
  for (const file of files) {
    for (const region of fileRegions(file, sources[file])) {
      if (regions.length >= MAX_REGIONS) return regions;
      regions.push(region);
    }
  }
  return regions;
}

/** The map as prompt lines: one region per line, file:name, signature, doc. */
export function renderSymbolMap(regions: SymbolRegion[]): string {
  return regions
    .map((region) => {
      const size = region.endLine - region.startLine + 1;
      const doc = region.doc ? ` — ${region.doc}` : '';
      return `- ${region.file}:${region.name} (${size} lines) \`${region.signature}\`${doc}`;
    })
    .join('\n');
}

/** Declarations whose *shape* is the contract, so they are worth quoting whole. */
const TYPE_DECLARATION = /^(?:export\s+)?(?:declare\s+)?(?:type|interface|enum)\s/;

/** Ceiling on the digest, so a large game cannot undo the two-call cost argument. */
export const MAX_DIGEST_LINES = 260;

/**
 * The game's API as the editing call needs it: every type in full, everything
 * else by signature alone.
 *
 * This is the cheap half of "show call 2 more". A region that must populate a
 * field, satisfy a return type, or call a neighbour fails not because the model
 * cannot write the function but because it cannot see what the function owes
 * anyone — and that obligation lives in the type declarations, which are a small
 * fraction of the bytes. Bodies stay out: they are the expensive part and they
 * are not what the edit has to agree with.
 */
export function renderApiDigest(
  sources: Record<string, string>,
  regions: SymbolRegion[],
  exclude?: SymbolRegion,
): string {
  const lines: string[] = [];
  let file: string | null = null;
  for (const region of regions) {
    // `<imports>` and `<file>` are placeholders for spans with no declaration in
    // them. They carry no API — quoting their first line just puts an import
    // statement in the prompt as if it were a symbol.
    if (region.name === '<imports>' || region.name === '<file>') continue;
    if (exclude && region.file === exclude.file && region.name === exclude.name) continue;
    const source = sources[region.file];
    if (source === undefined) continue;
    const isType = TYPE_DECLARATION.test(region.signature);
    const body = isType
      ? sliceRegion(source, region)
          .replace(/^\s*(?:\/\/|\/\*|\*).*$/gm, '')
          .trim()
      : null;
    const entry = body || `${region.signature.replace(/\s*\{\s*$/, '')} // …`;
    if (lines.length + entry.split('\n').length > MAX_DIGEST_LINES) break;
    if (region.file !== file) {
      file = region.file;
      lines.push(`${lines.length ? '\n' : ''}// ${file}`);
    }
    lines.push(entry);
  }
  return lines.join('\n').trim();
}

export function findRegion(regions: SymbolRegion[], file: string, name: string): SymbolRegion | null {
  return regions.find((region) => region.file === file && region.name === name) ?? null;
}

/** The exact text of a region, which is all the second call is given. */
export function sliceRegion(source: string, region: SymbolRegion): string {
  return source
    .split('\n')
    .slice(region.startLine - 1, region.endLine)
    .join('\n');
}

/**
 * Put an edited region back.
 *
 * Line-based rather than a diff: the model is handed one contiguous slice and
 * returns its replacement, so splicing is exact and there is no patch format to
 * misapply. A replacement that blows the line ceiling is refused — that is a
 * rewrite wearing an edit's clothes.
 */
export function spliceRegion(
  source: string,
  region: SymbolRegion,
  replacement: string,
): { ok: true; source: string } | { ok: false; error: string } {
  const replacementLines = replacement.split('\n');
  if (replacementLines.length > MAX_REGION_LINES) {
    return { ok: false, error: `replacement is ${replacementLines.length} lines (limit ${MAX_REGION_LINES})` };
  }
  const lines = source.split('\n');
  if (region.startLine < 1 || region.endLine > lines.length) {
    return { ok: false, error: 'region no longer fits the file' };
  }
  const next = [...lines.slice(0, region.startLine - 1), ...replacementLines, ...lines.slice(region.endLine)];
  return { ok: true, source: next.join('\n') };
}
