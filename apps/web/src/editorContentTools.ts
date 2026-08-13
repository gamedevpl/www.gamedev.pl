import type {
  EditorCollectionSpec,
  EditorItemContent,
  EditorLabel,
  EditorPathItemContent,
  EditorPathSpec,
  EditorTilemapItemContent,
  EditorTilemapSpec,
} from './studioApi.js';

export function defaultCollectionKey(collections: Record<string, unknown>): string | null {
  return Object.keys(collections).find((key) => key.length > 0) ?? null;
}

export function isTilemapItem(item: EditorItemContent): item is EditorTilemapItemContent {
  return 'rows' in item;
}

export function isPathItem(item: EditorItemContent): item is EditorPathItemContent {
  return 'points' in item;
}

export type PathProblemMessages = {
  pointCount: (count: number, min: number, max: number) => string;
  outOfBounds: (index: number) => string;
  distinct: () => string;
  repeatedEnd: () => string;
};

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
  spec: EditorTilemapSpec,
  item: EditorTilemapItemContent,
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

/** Hints only, server re-checks. Entities' rules are collection-wide (see below), so this returns `[]` for one. */
export function itemProblems(
  spec: EditorCollectionSpec['item'],
  item: EditorItemContent,
  name: (label: EditorLabel) => string,
  pathMessages?: PathProblemMessages,
) {
  if (spec.widget === 'path' && isPathItem(item)) return pathProblems(spec, item, pathMessages);
  if (spec.widget !== 'tilemap' || !isTilemapItem(item)) return [];
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
    if ('uniqueBy' in rule) continue;
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

function pathProblems(
  spec: EditorPathSpec,
  item: EditorPathItemContent,
  messages?: PathProblemMessages,
): string[] {
  const fallback: PathProblemMessages = {
    pointCount: (count, min, max) => `${count} points; expected ${min}-${max}`,
    outOfBounds: (index) => `Point ${index} is outside the grid`,
    distinct: () => 'A closed path needs at least 3 distinct points',
    repeatedEnd: () => 'Do not repeat the first point; closure is automatic',
  };
  const text = messages ?? fallback;
  const problems: string[] = [];
  if (item.points.length < spec.minPoints || item.points.length > spec.maxPoints) {
    problems.push(text.pointCount(item.points.length, spec.minPoints, spec.maxPoints));
  }
  item.points.forEach((point, index) => {
    if (!Number.isInteger(point.x) || !Number.isInteger(point.y) || point.x < 0 || point.y < 0 || point.x >= spec.gridCols || point.y >= spec.gridRows) {
      problems.push(text.outOfBounds(index + 1));
    }
  });
  if (spec.closed && item.points.length > 0) {
    if (new Set(item.points.map((point) => `${point.x},${point.y}`)).size < 3) problems.push(text.distinct());
    const first = item.points[0];
    const last = item.points[item.points.length - 1];
    if (first.x === last.x && first.y === last.y) problems.push(text.repeatedEnd());
  }
  return problems;
}

/** Entities' one rule (uniqueBy) is collection-wide — checked once, mirroring the server. */
export function collectionProblems(spec: EditorCollectionSpec, items: EditorItemContent[]): string[] {
  if (spec.item.widget !== 'entities') return [];
  const problems: string[] = [];
  for (const rule of spec.item.constraints) {
    if (!('uniqueBy' in rule)) continue;
    const seenAt = new Map<string, number>();
    items.forEach((entry, index) => {
      const value = entry.properties[rule.uniqueBy];
      const encoded = JSON.stringify(value);
      if (encoded === undefined) return;
      const firstIndex = seenAt.get(encoded);
      if (firstIndex !== undefined) {
        problems.push(`${firstIndex + 1} & ${index + 1} share the same ${rule.uniqueBy}`);
      } else {
        seenAt.set(encoded, index);
      }
    });
  }
  return problems;
}

export function setCell(
  item: EditorTilemapItemContent,
  row: number,
  col: number,
  char: string,
): EditorTilemapItemContent {
  const rows = item.rows.slice();
  rows[row] = rows[row].slice(0, col) + char + rows[row].slice(col + 1);
  return { ...item, rows };
}

export function blankItem(spec: EditorCollectionSpec['item']): EditorItemContent {
  const properties: Record<string, unknown> = {};
  for (const [name, propertySpec] of Object.entries(spec.properties)) {
    if (propertySpec.type === 'text') properties[name] = '';
    else if (propertySpec.type === 'int' || propertySpec.type === 'number') properties[name] = propertySpec.min;
    else if (propertySpec.type === 'enum') properties[name] = propertySpec.values[0];
    else properties[name] = false;
  }
  if (spec.widget === 'path') return { properties, points: blankPathPoints(spec) };
  if (spec.widget !== 'tilemap') return { properties };
  // Smallest legal grid, all first-tile — the creator paints from there.
  const fill = spec.tiles[0]?.char ?? '.';
  return { properties, rows: Array.from({ length: spec.grid.minRows }, () => fill.repeat(spec.grid.minCols)) };
}

function blankPathPoints(spec: EditorPathSpec) {
  const cells = Array.from({ length: spec.gridCols * spec.gridRows }, (_, index) => ({
    x: index % spec.gridCols,
    y: Math.floor(index / spec.gridCols),
  }));
  return Array.from({ length: spec.minPoints }, (_, index) => {
    if (index < cells.length) return cells[index];
    if (cells.length === 1) return cells[0];
    return cells[1 + ((index - cells.length) % (cells.length - 1))];
  });
}
