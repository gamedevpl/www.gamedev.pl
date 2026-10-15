import { useState } from 'react';
import type { Key } from 'ink';
import type { TuiSession } from './session.js';

const CTRL_R = '\u0012';
const CTRL_G = '\u0007';

// Ctrl+R: incremental search over sent prompts, newest first.
export function useHistorySearch(session: TuiSession) {
  const [search, setSearch] = useState<{ query: string; skip: number } | null>(null);
  const match = search ? session.findHistory(search.query, search.skip) : undefined;
  const handle = (input: string, key: Key, raw: string): boolean => {
    if (!search) {
      if (raw !== CTRL_R) return false;
      setSearch({ query: '', skip: 0 });
      return true;
    }
    if (raw === CTRL_R) {
      if (session.findHistory(search.query, search.skip + 1) !== undefined)
        setSearch({ ...search, skip: search.skip + 1 });
    } else if (key.escape || raw === CTRL_G || (key.ctrl && input === 'c')) setSearch(null);
    else if (key.return || key.tab || key.rightArrow) {
      if (match !== undefined) session.setDraft(match);
      setSearch(null);
    } else if (key.backspace || key.delete) setSearch({ query: [...search.query].slice(0, -1).join(''), skip: 0 });
    else if (!key.ctrl && !key.meta && input) setSearch({ query: search.query + input, skip: 0 });
    return true;
  };
  const view = search
    ? `search: ${search.query}█  ${match === undefined ? 'no match' : `→ ${match.replaceAll('\n', ' ⏎ ')}`}`
    : null;
  return { handle, view };
}
