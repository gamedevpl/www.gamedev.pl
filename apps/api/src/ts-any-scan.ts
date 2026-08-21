/**
 * Finds `any` — and the checker suppressions that stand in for it — in game TypeScript.
 *
 * Mirrored byte-for-byte below this header from `tools/lib/ts-any-scan.ts` in the games
 * repo, where the same scan is validate Check 37. Here it runs at `submit_sources`, so an
 * agent hears "no `any`" on upload instead of a gate round later. The cross-repo contract
 * check compares the two files; change them together.
 *
 * Uses `@babel/parser` rather than the `typescript` package this side already depends on
 * (5.9.3, with a real API): the games repo cannot use TypeScript's own compiler API
 * (`typescript@7` there ships no JS API, only the `tsc` binary), so both halves parse with
 * the same independent library rather than one side out-parsing the other.
 */

import { parse } from '@babel/parser';
import type { Comment, File, Node } from '@babel/types';

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

/** Node keys that hold source-position metadata or comment back-references, not child nodes. */
const NON_CHILD_KEYS = new Set([
  'loc',
  'start',
  'end',
  'range',
  'leadingComments',
  'trailingComments',
  'innerComments',
  'extra',
]);

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

/** Depth-first walk over every AST node reachable from `root`, in source order. */
function walk(root: Node, visit: (node: Node) => void): void {
  visit(root);
  for (const key of Object.keys(root)) {
    if (NON_CHILD_KEYS.has(key)) continue;
    const value = (root as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const entry of value) if (isNode(entry)) walk(entry, visit);
    } else if (isNode(value)) {
      walk(value, visit);
    }
  }
}

/**
 * A block comment with many suppression strings must not go quadratic locating them —
 * newline offsets are computed once per comment, then each match is placed by binary
 * search instead of rescanning from the comment's start.
 */
function findingsFromComments(comments: readonly Comment[]): BannedAnyFinding[] {
  const findings: BannedAnyFinding[] = [];
  for (const comment of comments) {
    const newlineOffsets: number[] = [];
    for (let i = 0; i < comment.value.length; i += 1) {
      if (comment.value[i] === '\n') newlineOffsets.push(i);
    }
    const locate = (offset: number) => {
      let lo = 0;
      let hi = newlineOffsets.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (newlineOffsets[mid]! < offset) lo = mid + 1;
        else hi = mid;
      }
      const newlinesBefore = lo;
      if (newlinesBefore === 0) {
        // On the comment's first line, the match sits after both the delimiter (`//` or
        // `/*`, always 2 characters) and the comment's own start column.
        return { line: comment.loc!.start.line, column: comment.loc!.start.column + 2 + offset + 1 };
      }
      return { line: comment.loc!.start.line + newlinesBefore, column: offset - newlineOffsets[newlinesBefore - 1]! };
    };
    for (const suppression of SUPPRESSIONS) {
      let found = comment.value.indexOf(suppression);
      while (found !== -1) {
        const { line, column } = locate(found);
        findings.push({ kind: 'ts-suppression', line, column, text: suppression });
        found = comment.value.indexOf(suppression, found + suppression.length);
      }
    }
  }
  return findings;
}

/**
 * Every banned occurrence in one TypeScript source, in source order.
 *
 * Runs on untrusted uploaded text; parsing untrusted source with a well-tested parser
 * that never executes it is the same trust boundary every other check in this pipeline
 * already crosses (esbuild, `tsc`).
 */
export function findBannedAnyUsages(source: string): BannedAnyFinding[] {
  let file: File;
  try {
    file = parse(source, { sourceType: 'module', plugins: ['typescript'] });
  } catch {
    return [];
  }

  const findings: BannedAnyFinding[] = [];
  walk(file.program as unknown as Node, (node) => {
    if (node.type === 'TSAnyKeyword') {
      findings.push({ kind: 'any-type', line: node.loc!.start.line, column: node.loc!.start.column + 1, text: 'any' });
    }
  });
  findings.push(...findingsFromComments(file.comments ?? []));
  findings.sort((a, b) => a.line - b.line || a.column - b.column);
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
