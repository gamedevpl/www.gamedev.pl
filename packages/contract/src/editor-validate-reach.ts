// Shared tilemap reachability flood fill.

import type { EditorLayerConstraint, EditorLayerSpec, LayerTileRef } from './editor-kit.js';
import { isPlainObject } from './editor-kit.js';

export function unreachable(
  rule: { from: string; blockedBy: string[]; require: string[] },
  rows: string[],
  charToKey: Map<string, string>,
  where: string,
): string[] {
  const height = rows.length;
  const width = height > 0 ? rows[0].length : 0;
  const keyAt = (row: number, col: number) => charToKey.get(rows[row][col]);
  const blocked = new Set(rule.blockedBy);
  const required = new Set(rule.require);

  const seen = new Set<number>();
  const queue: number[] = [];
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (keyAt(row, col) !== rule.from) continue;
      const index = row * width + col;
      seen.add(index);
      queue.push(index);
    }
  }
  if (queue.length === 0) return [];

  while (queue.length > 0) {
    const index = queue.shift() as number;
    const row = Math.floor(index / width);
    const col = index % width;
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
      const nextIndex = nextRow * width + nextCol;
      if (seen.has(nextIndex)) continue;
      seen.add(nextIndex);
      queue.push(nextIndex);
    }
  }

  const missed: string[] = [];
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const key = keyAt(row, col);
      if (key === undefined || !required.has(key)) continue;
      if (!seen.has(row * width + col)) missed.push(`${key} at row ${row + 1}, column ${col + 1}`);
    }
  }
  if (missed.length === 0) return [];
  return [
    `${where}: walled off from "${rule.from}" — ${missed.join('; ')}. ` +
      'Every required tile must be reachable, or the game cannot be finished.',
  ];
}

export function layerRows(
  layers: Record<string, EditorLayerSpec>,
  content: Record<string, unknown>,
  layer: string,
): string[] | null {
  const spec = layers[layer];
  const value = content[layer];
  if (!spec || spec.widget !== 'tilemap' || !isPlainObject(value) || !Array.isArray(value.rows)) return null;
  return value.rows.every((row) => typeof row === 'string') ? (value.rows as string[]) : null;
}

export function validateLayerReachable(
  rule: EditorLayerConstraint['reachable'],
  layers: Record<string, EditorLayerSpec>,
  content: Record<string, unknown>,
  where: string,
): string[] {
  const fromRows = layerRows(layers, content, rule.from.layer);
  if (!fromRows) return [];
  const tilemaps = new Map<string, string[]>();
  for (const ref of [rule.from, ...rule.blockedBy, ...rule.require]) {
    const rows = layerRows(layers, content, ref.layer);
    if (rows) tilemaps.set(ref.layer, rows);
  }
  const height = fromRows.length;
  const width = height > 0 ? fromRows[0].length : 0;
  if (
    width === 0 ||
    [...tilemaps.values()].some((rows) => rows.length !== height || rows.some((row) => row.length !== width))
  ) {
    return [`${where}: all referenced layers must have the same grid dimensions`];
  }
  const tileChar = new Map<string, Map<string, string>>();
  for (const ref of [rule.from, ...rule.blockedBy, ...rule.require]) {
    const spec = layers[ref.layer];
    if (spec?.widget !== 'tilemap') continue;
    if (!tileChar.has(ref.layer)) tileChar.set(ref.layer, new Map(spec.tiles.map((tile) => [tile.key, tile.char])));
  }
  const positions = (ref: LayerTileRef): Set<number> => {
    const rows = tilemaps.get(ref.layer);
    const char = tileChar.get(ref.layer)?.get(ref.tile);
    const result = new Set<number>();
    if (!rows || !char) return result;
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) if (row[x] === char) result.add(y * width + x);
    });
    return result;
  };
  const blocked = new Set<number>();
  for (const ref of rule.blockedBy) for (const position of positions(ref)) blocked.add(position);
  const seen = new Set<number>();
  const queue = [...positions(rule.from)];
  for (const position of queue) seen.add(position);
  while (queue.length > 0) {
    const position = queue.shift() as number;
    const row = Math.floor(position / width);
    const col = position % width;
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (nextRow < 0 || nextCol < 0 || nextRow >= height || nextCol >= width) continue;
      const next = nextRow * width + nextCol;
      if (blocked.has(next) || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  const missed = rule.require.flatMap((ref) =>
    [...positions(ref)]
      .filter((position) => !seen.has(position))
      .map((position) => {
        const row = Math.floor(position / width) + 1;
        const col = (position % width) + 1;
        return `${ref.layer}.${ref.tile} at row ${row}, column ${col}`;
      }),
  );
  return missed.length === 0
    ? []
    : [
        `${where}: walled off from "${rule.from.layer}.${rule.from.tile}" — ${missed.join('; ')}. ` +
          'Every required tile must be reachable, or the game cannot be finished.',
      ];
}
