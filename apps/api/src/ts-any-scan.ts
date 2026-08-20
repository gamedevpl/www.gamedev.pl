/**
 * Finds `any` — and the checker suppressions that stand in for it — in game TypeScript.
 *
 * Mirrored byte-for-byte below this header from `tools/lib/ts-any-scan.ts` in the games
 * repo, where the same scan is validate Check 37. Here it runs at `submit_sources`, so an
 * agent hears "no `any`" on upload instead of a gate round later. The cross-repo contract
 * check compares the two files; change them together.
 *
 * A parser is not used even though this side has one: the games repo cannot parse
 * (`typescript@7` there ships no JS API), and a refusal here the gate would not repeat is
 * worse than the lexer's rough edges, which the games-repo header documents.
 */

export type BannedAnyKind = 'any-type' | 'ts-suppression';

export interface BannedAnyFinding {
  kind: BannedAnyKind;
  /** 1-based, so it reads like a compiler diagnostic. */
  line: number;
  /** 1-based. */
  column: number;
  /** The exact text that tripped the scan: `any`, or the suppression directive. */
  text: string;
}

/**
 * Suppressions are banned alongside `any` because they are the same hole with a different
 * spelling: a game that silences the type error keeps the runtime error the type was
 * about to prevent, and an agent told only "no `any`" reaches for these next.
 *
 * Assembled from parts rather than written out, for the same reason `tools/no-plain-js.ts`
 * builds its pattern that way: this repo bans those directives in its own TypeScript too,
 * and a file that names one is indistinguishable from a file that uses one.
 */
const SUPPRESSION_PREFIX = '@ts-';
const SUPPRESSIONS = ['ignore', 'expect-error', 'nocheck'].map((name) => `${SUPPRESSION_PREFIX}${name}`);

/** After these, a `/` opens a regex literal; after anything else it divides. */
const REGEX_PRECEDING_PUNCTUATION = new Set([
  '',
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '*',
  '%',
  '~',
  '^',
  '<',
  '>',
]);
const REGEX_PRECEDING_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'case',
  'do',
  'else',
  'yield',
  'await',
]);

function isIdentifierStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

/**
 * Every banned occurrence in one TypeScript source, in source order.
 *
 * Runs on untrusted uploaded text, so it is a single forward pass with no backtracking
 * and no regex over the whole source: cost is linear in the file's length.
 */
export function findBannedAnyUsages(source: string): BannedAnyFinding[] {
  const findings: BannedAnyFinding[] = [];
  let index = 0;
  let line = 1;
  let lineStart = 0;
  /** One entry per `${` we are inside, counting the braces opened within it. */
  const templateExpressions: { braces: number }[] = [];
  let inTemplateText = false;
  /** Last significant token, for the regex-or-division decision. */
  let previous = '';

  const columnAt = (at: number) => at - lineStart + 1;

  const advanceLine = () => {
    line += 1;
    lineStart = index + 1;
  };

  const record = (kind: BannedAnyKind, at: number, text: string) => {
    findings.push({ kind, line, column: columnAt(at), text });
  };

  const scanComment = (text: string, startIndex: number) => {
    // `line`/`lineStart` as they stood when the comment started — captured once so a
    // comment with many suppression strings locates every match without rescanning from
    // the comment's start each time, which went quadratic in the comment's length.
    const startLine = line;
    const startLineStart = lineStart;
    const newlineOffsets: number[] = [];
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === '\n') newlineOffsets.push(i);
    }
    const locate = (offset: number) => {
      // Last newline in the comment strictly before `offset`, via binary search.
      let lo = 0;
      let hi = newlineOffsets.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (newlineOffsets[mid]! < offset) lo = mid + 1;
        else hi = mid;
      }
      const newlinesBefore = lo;
      const lineStartAbsolute =
        newlinesBefore === 0 ? startLineStart : startIndex + newlineOffsets[newlinesBefore - 1]! + 1;
      return { line: startLine + newlinesBefore, column: startIndex + offset - lineStartAbsolute + 1 };
    };
    for (const suppression of SUPPRESSIONS) {
      let found = text.indexOf(suppression);
      while (found !== -1) {
        const { line: commentLine, column } = locate(found);
        findings.push({ kind: 'ts-suppression', line: commentLine, column, text: suppression });
        found = text.indexOf(suppression, found + suppression.length);
      }
    }
  };

  while (index < source.length) {
    const char = source[index]!;

    if (inTemplateText) {
      if (char === '\\') {
        if (source[index + 1] === '\n') advanceLine();
        index += 2;
        continue;
      }
      if (char === '\n') {
        advanceLine();
        index += 1;
        continue;
      }
      if (char === '`') {
        inTemplateText = false;
        previous = '`';
        index += 1;
        continue;
      }
      if (char === '$' && source[index + 1] === '{') {
        templateExpressions.push({ braces: 0 });
        inTemplateText = false;
        previous = '{';
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    if (char === '\n') {
      advanceLine();
      index += 1;
      continue;
    }

    if (char === ' ' || char === '\t' || char === '\r') {
      index += 1;
      continue;
    }

    if (char === '/' && source[index + 1] === '/') {
      const end = source.indexOf('\n', index);
      const stop = end === -1 ? source.length : end;
      scanComment(source.slice(index, stop), index);
      index = stop;
      continue;
    }

    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      scanComment(source.slice(index, stop), index);
      for (; index < stop; index += 1) {
        if (source[index] === '\n') advanceLine();
      }
      continue;
    }

    if (char === '"' || char === "'") {
      index += 1;
      while (index < source.length) {
        const stringChar = source[index]!;
        if (stringChar === '\\') {
          if (source[index + 1] === '\n') advanceLine();
          index += 2;
          continue;
        }
        if (stringChar === '\n') {
          // Unterminated string; the compiler will say so far more clearly than this can.
          advanceLine();
          index += 1;
          break;
        }
        index += 1;
        if (stringChar === char) break;
      }
      previous = 'x';
      continue;
    }

    if (char === '`') {
      inTemplateText = true;
      index += 1;
      continue;
    }

    if (char === '{') {
      const enclosing = templateExpressions[templateExpressions.length - 1];
      if (enclosing) enclosing.braces += 1;
      previous = '{';
      index += 1;
      continue;
    }

    if (char === '}') {
      const enclosing = templateExpressions[templateExpressions.length - 1];
      if (enclosing) {
        if (enclosing.braces === 0) {
          templateExpressions.pop();
          inTemplateText = true;
          previous = 'x';
          index += 1;
          continue;
        }
        enclosing.braces -= 1;
      }
      previous = '}';
      index += 1;
      continue;
    }

    if ((char === '+' && source[index + 1] === '+') || (char === '-' && source[index + 1] === '-')) {
      // `++`/`--` (prefix or postfix) always leave a value behind, so a `/` right after
      // divides — unlike a single `+`/`-`, which a regex can legally follow. Without this,
      // `left++ / (x as any)` reads the `/` as opening a regex and the `any` never surfaces.
      previous = 'x';
      index += 2;
      continue;
    }

    if (char === '/') {
      const startsRegex = REGEX_PRECEDING_PUNCTUATION.has(previous) || REGEX_PRECEDING_KEYWORDS.has(previous);
      if (!startsRegex) {
        previous = '/';
        index += 1;
        continue;
      }
      index += 1;
      let inClass = false;
      while (index < source.length) {
        const regexChar = source[index]!;
        if (regexChar === '\\') {
          index += 2;
          continue;
        }
        if (regexChar === '\n') {
          // Not a regex after all (they cannot span lines) — resync on the next line.
          advanceLine();
          index += 1;
          break;
        }
        if (regexChar === '[') inClass = true;
        else if (regexChar === ']') inClass = false;
        else if (regexChar === '/' && !inClass) {
          index += 1;
          break;
        }
        index += 1;
      }
      while (index < source.length && isIdentifierPart(source[index]!)) index += 1;
      previous = 'x';
      continue;
    }

    if (isIdentifierStart(char)) {
      const start = index;
      while (index < source.length && isIdentifierPart(source[index]!)) index += 1;
      const word = source.slice(start, index);
      // After a dot the word is a member name, never the type.
      if (word === 'any' && previous !== '.') record('any-type', start, 'any');
      previous = word;
      continue;
    }

    previous = char;
    index += 1;
  }

  return findings;
}

/** One human-readable line per finding, in the shape both repos report it. */
export function describeBannedAnyFinding(fileName: string, finding: BannedAnyFinding): string {
  const where = `${fileName}:${finding.line}:${finding.column}`;
  return finding.kind === 'any-type' ? `${where} uses the \`any\` type` : `${where} uses \`${finding.text}\``;
}

/**
 * The sentence both repos say when they refuse. One wording, so an agent that meets it at
 * upload and an author who meets it in the gate are being told the same thing.
 */
export const BANNED_ANY_GUIDANCE =
  'Game code must not use the `any` type, and must not silence the checker with a ' +
  `\`${SUPPRESSIONS.join('` / `')}\` directive. \`any\` turns off exactly the checks ` +
  'that catch the mistakes that crash a game at runtime, in front of a player. Name the ' +
  'real type instead: GameKit ships one for everything it hands you (`GameKitGameContext`, ' +
  '`GameKitDraw`, `GameKitInput`, …), your own state has the interfaces in your model ' +
  'module, and for a value whose shape is genuinely unknown use `unknown` and narrow it.';
