type Edit = { op: 'eq' | 'del' | 'ins'; line: string };

const MAX_DIFF_LINES = 1500;

function linesOf(text: string): { lines: string[]; newline: boolean } {
  if (!text) return { lines: [], newline: false };
  const newline = text.endsWith('\n');
  const body = newline ? text.slice(0, -1) : text;
  return { lines: body ? body.split('\n') : [], newline };
}

function lineDiff(before: string[], after: string[]): Edit[] {
  const width = after.length + 1;
  const dp = new Uint32Array((before.length + 1) * width);
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      const at = i * width + j;
      dp[at] = before[i] === after[j] ? (dp[at + width + 1] ?? 0) + 1 : Math.max(dp[at + width] ?? 0, dp[at + 1] ?? 0);
    }
  }
  const edits: Edit[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      edits.push({ op: 'eq', line: before[i]! });
      i += 1;
      j += 1;
    } else if ((dp[(i + 1) * width + j] ?? 0) >= (dp[i * width + j + 1] ?? 0)) {
      edits.push({ op: 'del', line: before[i]! });
      i += 1;
    } else {
      edits.push({ op: 'ins', line: after[j]! });
      j += 1;
    }
  }
  while (i < before.length) edits.push({ op: 'del', line: before[i++]! });
  while (j < after.length) edits.push({ op: 'ins', line: after[j++]! });
  return edits;
}

function formatHunks(edits: Edit[]): string[] {
  const context = 3;
  const ranges: Array<[number, number]> = [];
  edits.forEach((edit, index) => {
    if (edit.op === 'eq') return;
    const start = Math.max(0, index - context);
    const end = Math.min(edits.length, index + context + 1);
    const last = ranges[ranges.length - 1];
    if (last && start <= last[1]) last[1] = end;
    else ranges.push([start, end]);
  });
  const lines: string[] = [];
  for (const [start, end] of ranges) {
    let oldStart = 1;
    let newStart = 1;
    for (let i = 0; i < start; i += 1) {
      if (edits[i]!.op !== 'ins') oldStart += 1;
      if (edits[i]!.op !== 'del') newStart += 1;
    }
    let oldCount = 0;
    let newCount = 0;
    const body: string[] = [];
    for (let i = start; i < end; i += 1) {
      const edit = edits[i]!;
      if (edit.op !== 'ins') oldCount += 1;
      if (edit.op !== 'del') newCount += 1;
      const prefix = edit.op === 'eq' ? ' ' : edit.op === 'del' ? '-' : '+';
      body.push(`${prefix}${edit.line}`);
    }
    lines.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    lines.push(...body);
  }
  return lines;
}

export function unifiedDiff(path: string, platformText: string | null, localText: string | null): string[] {
  if (platformText === localText) return [];
  const beforeText = platformText ?? '';
  const afterText = localText ?? '';
  const beforeMissing = platformText === null ? '/dev/null' : `platform/${path}`;
  const afterMissing = localText === null ? '/dev/null' : `local/${path}`;
  const header = [`--- ${beforeMissing}`, `+++ ${afterMissing}`];
  if (beforeText.includes('\0') || afterText.includes('\0')) return [...header, `binary ${path} differs`];
  const before = linesOf(beforeText);
  const after = linesOf(afterText);
  if (
    platformText !== null &&
    localText !== null &&
    before.lines.join('\n') === after.lines.join('\n') &&
    before.newline !== after.newline
  ) {
    return [...header, 'newline at end of file differs'];
  }
  if (before.lines.length > MAX_DIFF_LINES || after.lines.length > MAX_DIFF_LINES) {
    return [...header, `${path} differs (${before.lines.length} platform lines, ${after.lines.length} local lines)`];
  }
  return [...header, ...formatHunks(lineDiff(before.lines, after.lines))];
}
