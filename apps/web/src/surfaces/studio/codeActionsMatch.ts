// Match/shortcut helpers, separate so CodeActionsMenu exports only components.

const IS_MAC = typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform);

export function formatShortcut(key: string, options?: { shift?: boolean }): string {
  const shift = options?.shift ?? false;
  return IS_MAC ? `${shift ? '⇧' : ''}⌘${key}` : `Ctrl+${shift ? 'Shift+' : ''}${key}`;
}

// VS Code-style subsequence match: offsets plus score, null on miss.
export function fuzzyMatch(query: string, target: string): { score: number; positions: number[] } | null {
  const needle = query.toLowerCase().replace(/\s+/g, '');
  if (!needle) return { score: 0, positions: [] };
  const haystack = target.toLowerCase();
  const positions: number[] = [];
  let score = 0;
  let searchFrom = 0;
  for (const char of needle) {
    const at = haystack.indexOf(char, searchFrom);
    if (at === -1) return null;
    if (positions.length > 0 && at === positions[positions.length - 1]! + 1) score += 4;
    else if (at === 0 || '/.-_ '.includes(haystack[at - 1]!)) score += 2;
    positions.push(at);
    searchFrom = at + 1;
  }
  // Earlier, tighter matches beat late scattered ones; shorter targets break ties.
  return {
    score: score - Math.floor(positions[positions.length - 1]! / 8) - Math.floor(target.length / 64),
    positions,
  };
}
