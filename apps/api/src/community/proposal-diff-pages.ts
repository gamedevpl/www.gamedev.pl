import { diffFile, type DiffLine } from './proposal-diff.js';
import { isDiffableText } from './proposal-change-set.js';

// One file's unified diff, in byte-capped pages for an agent.

export const PROPOSAL_DIFF_PAGE_BYTES = 8 * 1024;
const MAX_LINE_BYTES = 1024;

export type ProposalDiffPage =
  | { ok: true; path: string; page: number; pages: number; diff: string; nextPage?: number }
  | { ok: false; reason: 'unchanged' | 'not_text' | 'too_large' | 'page_out_of_range' };

function clip(text: string): string {
  if (Buffer.byteLength(text, 'utf8') <= MAX_LINE_BYTES) return text;
  return `${Buffer.from(text, 'utf8').subarray(0, MAX_LINE_BYTES).toString('utf8')}… [line truncated]`;
}

// Groups context-trimmed lines into hunks with @@ headers.
function unifiedLines(path: string, lines: DiffLine[], added: boolean, removed: boolean): string[] {
  const out = [`--- ${added ? '/dev/null' : `a/${path}`}`, `+++ ${removed ? '/dev/null' : `b/${path}`}`];
  let hunk: DiffLine[] = [];
  let nextA: number | undefined;
  let nextB: number | undefined;
  const flush = () => {
    if (hunk.length === 0) return;
    const olds = hunk.filter((line) => line.a !== undefined);
    const news = hunk.filter((line) => line.b !== undefined);
    const oldStart = olds[0]?.a ?? 0;
    const newStart = news[0]?.b ?? 0;
    out.push(`@@ -${oldStart},${olds.length} +${newStart},${news.length} @@`);
    for (const line of hunk)
      out.push(clip(`${line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}${line.text}`));
    hunk = [];
  };
  for (const line of lines) {
    const jumpA = line.a !== undefined && nextA !== undefined && line.a !== nextA;
    const jumpB = line.b !== undefined && nextB !== undefined && line.b !== nextB;
    if (jumpA || jumpB) flush();
    hunk.push(line);
    if (line.a !== undefined) nextA = line.a + 1;
    if (line.b !== undefined) nextB = line.b + 1;
  }
  flush();
  return out;
}

function paginate(lines: string[]): string[] {
  const pages: string[] = [];
  let current: string[] = [];
  let bytes = 0;
  for (const line of lines) {
    const size = Buffer.byteLength(line, 'utf8') + 1;
    if (bytes + size > PROPOSAL_DIFF_PAGE_BYTES && current.length > 0) {
      pages.push(current.join('\n'));
      current = [];
      bytes = 0;
    }
    current.push(line);
    bytes += size;
  }
  if (current.length > 0) pages.push(current.join('\n'));
  return pages;
}

export function proposalDiffPage(
  path: string,
  before: string | null,
  after: string | null,
  page = 1,
): ProposalDiffPage {
  if (before === after) return { ok: false, reason: 'unchanged' };
  for (const side of [before, after]) {
    if (side !== null && side.includes('\u0000')) return { ok: false, reason: 'not_text' };
    if (!isDiffableText(side)) return { ok: false, reason: 'too_large' };
  }
  const diff = diffFile(path, before, after, Number.POSITIVE_INFINITY);
  if (!diff) return { ok: false, reason: 'unchanged' };
  const pages = paginate(unifiedLines(path, diff.lines, before === null, after === null));
  if (!Number.isInteger(page) || page < 1 || page > pages.length) return { ok: false, reason: 'page_out_of_range' };
  return {
    ok: true,
    path,
    page,
    pages: pages.length,
    diff: pages[page - 1]!,
    ...(page < pages.length ? { nextPage: page + 1 } : {}),
  };
}
