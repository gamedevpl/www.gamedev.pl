// Line-level diff for the Code surface's diff view.

export type DiffLine = { kind: 'context' | 'added' | 'removed'; text: string };

// Classic LCS backtrace; files here are under the module line budget.
export function diffLines(base: string, next: string): DiffLine[] {
  const a = base.split('\n');
  const b = next.split('\n');
  const n = a.length;
  const m = b.length;

  // lcs stores the longest common subsequence length from that pair.
  const lcs: Uint32Array[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) lcs[i] = new Uint32Array(m + 1);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'context', text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ kind: 'removed', text: a[i]! });
      i++;
    } else {
      out.push({ kind: 'added', text: b[j]! });
      j++;
    }
  }
  while (i < n) {
    out.push({ kind: 'removed', text: a[i]! });
    i++;
  }
  while (j < m) {
    out.push({ kind: 'added', text: b[j]! });
    j++;
  }
  return out;
}
