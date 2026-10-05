// Remix code-lane output filter: no source echoes reach the player.

export const ECHO_SHINGLE_CHARS = 60;
export const MAX_SUMMARY_CHARS = 240;
// Extra literal bytes allowed before the share-of-file test applies.
export const LITERAL_GROWTH_FLOOR = 1_500;

export type CodeLaneFilterVerdict = { ok: true } | { ok: false; why: 'source_echo' | 'literal_bloat' | 'summary' };

export interface CodeLaneFilterInput {
  // The game's sources before the edit (path to text).
  original: Record<string, string>;
  // The edited files the lane returned (path to text).
  overrides: Record<string, string>;
  // The kit declaration the editing call was shown, if any.
  kit?: string;
  summary?: { en?: string; pl?: string };
}

interface Scanned {
  literals: string[];
  // Source text with every string/template literal removed.
  rest: string;
}

// A small TS lexer: enough to split literals from code and comments.
export function scanLiterals(source: string): Scanned {
  const literals: string[] = [];
  let rest = '';
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      const stop = end === -1 ? source.length : end;
      rest += source.slice(index, stop);
      index = stop;
      continue;
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      rest += source.slice(index, stop);
      index = stop;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      let cursor = index + 1;
      let text = '';
      while (cursor < source.length && source[cursor] !== char) {
        if (source[cursor] === '\\' && cursor + 1 < source.length) {
          text += source[cursor + 1];
          cursor += 2;
          continue;
        }
        if (char !== '`' && source[cursor] === '\n') break;
        text += source[cursor];
        cursor += 1;
      }
      literals.push(text);
      rest += ' ';
      index = cursor + 1;
      continue;
    }
    rest += char;
    index += 1;
  }
  return { literals, rest };
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function echoes(text: string, corpus: string, width: number): boolean {
  const flat = normalize(text);
  if (flat.length < width) return false;
  const step = Math.max(1, Math.floor(width / 3));
  for (let start = 0; start + width <= flat.length; start += step) {
    if (corpus.includes(flat.slice(start, start + width))) return true;
  }
  return corpus.includes(flat.slice(flat.length - width));
}

function literalBytes(literals: string[]): number {
  return literals.reduce((sum, literal) => sum + literal.length, 0);
}

// Backticks, arrows, or brace/semicolon-heavy text reads as code.
export function looksLikeCode(text: string): boolean {
  if (/[`]|=>|\/\/|\/\*/.test(text)) return true;
  if (/\b(function|const|let|var|return|import|export|class)\b[^.]*[;{=(]/.test(text)) return true;
  const punctuation = (text.match(/[{};=<>[\]]/g) ?? []).length;
  return text.length > 0 && punctuation / text.length > 0.06;
}

// Rejects edits whose new literals or summary reproduce original code or comments.
export function screenCodeLaneOutput(input: CodeLaneFilterInput): CodeLaneFilterVerdict {
  const originalScans = Object.fromEntries(
    Object.entries(input.original).map(([path, text]) => [path, scanLiterals(text)] as const),
  );
  const corpus = normalize(
    [...Object.values(originalScans).map((scan) => scan.rest), scanLiterals(input.kit ?? '').rest].join('\n'),
  );

  for (const [path, text] of Object.entries(input.overrides)) {
    const before = originalScans[path] ?? { literals: [], rest: '' };
    const known = new Set(before.literals.map(normalize));
    const after = scanLiterals(text);
    for (const literal of after.literals) {
      if (known.has(normalize(literal))) continue;
      if (echoes(literal, corpus, ECHO_SHINGLE_CHARS)) return { ok: false, why: 'source_echo' };
    }
    const grown = literalBytes(after.literals) - literalBytes(before.literals);
    const beforeShare = literalBytes(before.literals) / Math.max(1, input.original[path]?.length ?? 0);
    const afterShare = literalBytes(after.literals) / Math.max(1, text.length);
    if (grown > LITERAL_GROWTH_FLOOR && afterShare > beforeShare * 2 + 0.1) {
      return { ok: false, why: 'literal_bloat' };
    }
  }

  for (const side of [input.summary?.en, input.summary?.pl]) {
    if (side === undefined) continue;
    if (side.length > MAX_SUMMARY_CHARS || looksLikeCode(side)) return { ok: false, why: 'summary' };
    if (echoes(side, corpus, ECHO_SHINGLE_CHARS)) return { ok: false, why: 'summary' };
  }
  return { ok: true };
}

// Keeps a failure summary only when it would pass the success-path checks.
export function safeSummary<T extends { en?: string; pl?: string }>(summary: T | undefined): T | undefined {
  if (!summary) return undefined;
  const sides = [summary.en, summary.pl].filter((side): side is string => side !== undefined);
  return sides.every((side) => side.length <= MAX_SUMMARY_CHARS && !looksLikeCode(side)) ? summary : undefined;
}
