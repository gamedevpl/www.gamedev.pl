export type TranscriptRow = { index: number; key: string; top: number; height?: number };

export function transcriptRows(lines: string[], offset: number, heights: ReadonlyMap<string, number>) {
  let total = 0;
  const rows = lines.slice(offset).map((line, index): TranscriptRow => {
    const position = offset + index;
    const key = JSON.stringify([line, lines[position - 1]]);
    const height = heights.get(key);
    const row = { index: position, key, top: total, height };
    total += height ?? 0;
    return row;
  });
  return { rows, total };
}

export function transcriptWindow(rows: TranscriptRow[], start: number, height: number) {
  const segments: Array<{ index: number; height?: number }> = [];
  for (const row of rows) {
    if (row.height === undefined || (row.top < start + height && row.top + row.height > start)) {
      segments.push({ index: row.index });
    } else {
      const previous = segments.at(-1);
      if (previous?.height !== undefined) previous.height += row.height;
      else segments.push({ index: row.index, height: row.height });
    }
  }
  return segments;
}
