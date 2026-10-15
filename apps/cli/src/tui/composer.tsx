import { Text } from 'ink';
import { cells } from './screen-grid.js';

export const MAX_DRAFT_ROWS = 6;

// Highlights the cell under the cursor instead of inserting a glyph.
export function cursorCell(ch: string, color: boolean): string {
  return color ? `\u001b[48;5;245;38;5;231m${ch}\u001b[39;49m` : `\u001b[7m${ch}\u001b[27m`;
}

// Wraps the draft into rows of `room` cells and marks the cursor.
export function draftLayout(draft: string, cursor: number, room: number, maxRows = MAX_DRAFT_ROWS) {
  const width = Math.max(1, room);
  const rows: Array<{ text: string; cursorAt?: number }> = [];
  let offset = 0;
  for (const line of draft.split('\n')) {
    const chars = [...line];
    let start = 0;
    do {
      let used = 0;
      let end = start;
      while (end < chars.length && used + cells(chars[end]!).length <= width) used += cells(chars[end++]!).length;
      if (end === start && end < chars.length) end++;
      const row: { text: string; cursorAt?: number } = { text: chars.slice(start, end).join('') };
      const last = end === chars.length;
      if (cursor >= offset + start && (cursor < offset + end || (last && cursor === offset + end))) {
        row.cursorAt = cursor - offset - start;
      }
      rows.push(row);
      start = end;
    } while (start < chars.length);
    offset += chars.length + 1;
  }
  const focus = Math.max(
    0,
    rows.findIndex((row) => row.cursorAt !== undefined),
  );
  const first = Math.max(0, Math.min(focus - Math.floor(maxRows / 2), rows.length - maxRows));
  return {
    rows: rows.slice(first, first + maxRows),
    hiddenBefore: first > 0,
    hiddenAfter: first + maxRows < rows.length,
  };
}

export function DraftLines({
  draft,
  cursor,
  room,
  prompt,
  accent,
  color,
}: {
  draft: string;
  cursor: number;
  room: number;
  prompt: string;
  accent?: string;
  color: boolean;
}) {
  const layout = draftLayout(draft, cursor, room);
  return (
    <>
      {layout.rows.map((row, index) => {
        const chars = [...row.text];
        const at = row.cursorAt;
        const lead = index === 0 ? `${prompt} ` : '  ';
        const marker = index === 0 && layout.hiddenBefore ? '…' : '';
        return (
          <Text key={index} wrap="truncate-end">
            <Text color={accent} bold>
              {lead}
            </Text>
            {marker}
            {at === undefined
              ? row.text
              : `${chars.slice(0, at).join('')}${cursorCell(chars[at] ?? ' ', color)}${chars.slice(at + 1).join('')}`}
            {index === layout.rows.length - 1 && layout.hiddenAfter ? '…' : ''}
          </Text>
        );
      })}
    </>
  );
}
