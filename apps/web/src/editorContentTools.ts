import type { EditorCollectionSpec, EditorItemContent, EditorLabel } from './studioApi.js';

/**
 * The pure half of the content painter, shared by its two surfaces: the
 * Studio's EditorPanel (creator drafts) and the RemixPanel's painter (player
 * sessions). Promoted here on the repo's two-consumer rule — above all so the
 * `reachable` mirror stays one flood fill: a live check that drifts from the
 * rule the server enforces is worse than none, and two copies is how it
 * drifts.
 */

/**
 * Four-way flood fill, mirroring the contract's `reachable` rule.
 *
 * Without this the panel reported "all checks pass" for a map whose goal was
 * walled off, and the creator only found out when the save was refused — and a
 * remixer, whose paintings never reach the server, would never find out at all.
 */
export function unreachableCount(
  spec: EditorCollectionSpec['item'],
  item: EditorItemContent,
  rule: { from: string; blockedBy: string[]; require: string[] },
): number {
  const rows = item.rows;
  const height = rows.length;
  const width = height > 0 ? rows[0].length : 0;
  const charToKey = new Map(spec.tiles.map((tile) => [tile.char, tile.key]));
  const keyAt = (row: number, col: number) => charToKey.get(rows[row][col]);
  const blocked = new Set(rule.blockedBy);
  const required = new Set(rule.require);

  const seen = new Set<number>();
  const queue: Array<[number, number]> = [];
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (keyAt(row, col) !== rule.from) continue;
      seen.add(row * width + col);
      queue.push([row, col]);
    }
  }
  if (queue.length === 0) return 0;
  while (queue.length > 0) {
    const [row, col] = queue.shift() as [number, number];
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (nextRow < 0 || nextCol < 0 || nextRow >= height || nextCol >= width) continue;
      if (rows[nextRow].length !== width) continue;
      const key = keyAt(nextRow, nextCol);
      if (key === undefined || blocked.has(key)) continue;
      const index = nextRow * width + nextCol;
      if (seen.has(index)) continue;
      seen.add(index);
      queue.push([nextRow, nextCol]);
    }
  }
  let missed = 0;
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const key = keyAt(row, col);
      if (key !== undefined && required.has(key) && !seen.has(row * width + col)) missed += 1;
    }
  }
  return missed;
}

/** Client-side mirror of the constraint arithmetic — hints only; the server re-checks. */
export function itemProblems(
  spec: EditorCollectionSpec['item'],
  item: EditorItemContent,
  name: (label: EditorLabel) => string,
) {
  const counts = new Map<string, number>(spec.tiles.map((tile) => [tile.key, 0]));
  const charToKey = new Map(spec.tiles.map((tile) => [tile.char, tile.key]));
  for (const row of item.rows) {
    for (const char of row) {
      const key = charToKey.get(char);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const tileName = (key: string) => {
    const tile = spec.tiles.find((entry) => entry.key === key);
    return tile ? name(tile.label) : key;
  };
  const problems: string[] = [];
  for (const rule of spec.constraints) {
    if ('reachable' in rule) {
      const missed = unreachableCount(spec, item, rule.reachable);
      if (missed > 0) {
        problems.push(
          `${missed} × ${tileName(rule.reachable.require[0] ?? '')} walled off from ${tileName(rule.reachable.from)}`,
        );
      }
      continue;
    }
    if ('equalCounts' in rule) {
      const [a, b] = rule.equalCounts;
      if (counts.get(a) !== counts.get(b)) {
        problems.push(`${tileName(a)} ${counts.get(a) ?? 0} ≠ ${tileName(b)} ${counts.get(b) ?? 0}`);
      }
      continue;
    }
    const count = counts.get(rule.tile) ?? 0;
    if (rule.exactly !== undefined && count !== rule.exactly) {
      problems.push(`${tileName(rule.tile)}: ${count} / ${rule.exactly}`);
    }
    if (rule.min !== undefined && count < rule.min) {
      problems.push(`${tileName(rule.tile)}: ${count} < ${rule.min}`);
    }
    if (rule.max !== undefined && count > rule.max) {
      problems.push(`${tileName(rule.tile)}: ${count} > ${rule.max}`);
    }
  }
  return problems;
}

export function setCell(item: EditorItemContent, row: number, col: number, char: string): EditorItemContent {
  const rows = item.rows.slice();
  rows[row] = rows[row].slice(0, col) + char + rows[row].slice(col + 1);
  return { ...item, rows };
}

export function blankItem(spec: EditorCollectionSpec['item']): EditorItemContent {
  // A fresh item starts as the smallest legal grid, all first-tile — the
  // creator paints from there; constraints show what is still missing.
  const fill = spec.tiles[0]?.char ?? '.';
  const properties: Record<string, unknown> = {};
  for (const [name, propertySpec] of Object.entries(spec.properties)) {
    if (propertySpec.type === 'text') properties[name] = '';
    else if (propertySpec.type === 'int' || propertySpec.type === 'number') properties[name] = propertySpec.min;
    else if (propertySpec.type === 'enum') properties[name] = propertySpec.values[0];
    else properties[name] = false;
  }
  return { properties, rows: Array.from({ length: spec.grid.minRows }, () => fill.repeat(spec.grid.minCols)) };
}
