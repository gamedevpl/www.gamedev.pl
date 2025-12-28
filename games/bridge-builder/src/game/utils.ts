import { SCALE, VIEW_W, VIEW_H, GRID, MATERIALS } from './constants';
import { Node, Beam, Camera } from './types';
import planck from 'planck';

const Vec2 = planck.Vec2;

/**
 * Utility functions for Bridge Builder
 */

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

export const snap = (v: number, step: number): number => Math.round(v / step) * step;

export function makeId(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function worldToView(p: { x: number; y: number }, cam: Camera): { x: number; y: number } {
  const x = (p.x - cam.x) * SCALE + VIEW_W / 2;
  const y = VIEW_H / 2 - (p.y - cam.y) * SCALE;
  return { x, y };
}

export function viewToWorld(px: number, py: number, cam: Camera): planck.Vec2 {
  const x = (px - VIEW_W / 2) / SCALE + cam.x;
  const y = (VIEW_H / 2 - py) / SCALE + cam.y;
  return Vec2(x, y);
}

export function pointSegmentDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const abx = b.x - a.x,
    aby = b.y - a.y;
  const apx = p.x - a.x,
    apy = p.y - a.y;
  const ab2 = abx * abx + aby * aby;
  const t = ab2 > 1e-9 ? clamp((apx * abx + apy * aby) / ab2, 0, 1) : 0;
  const cx = a.x + abx * t,
    cy = a.y + aby * t;
  return Math.hypot(p.x - cx, p.y - cy);
}

export function computeCost(nodesById: Record<string, Node>, beams: Beam[]): number {
  let sum = 0;
  for (const b of beams) {
    const A = nodesById[b.a];
    const B = nodesById[b.b];
    if (!A || !B) continue;
    const L = dist(A, B);
    sum += MATERIALS[b.mat].costPerM * L;
  }
  return sum;
}

export function pretty(n: number): string {
  if (!Number.isFinite(n)) return '–';
  return n.toFixed(0);
}

export function bresenhamLine(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  let dx = Math.abs(x1 - x0);
  let sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0);
  let sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let cx = x0,
    cy = y0;
  let running = true;
  while (running) {
    pts.push([cx, cy]);
    if (cx === x1 && cy === y1) {
      running = false;
    } else {
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        cx += sx;
      }
      if (e2 <= dx) {
        err += dx;
        cy += sy;
      }
    }
  }
  return pts;
}

export function drawPixelLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness = 1,
): void {
  const pts = bresenhamLine(x0, y0, x1, y1);
  for (const [x, y] of pts) {
    for (let oy = -Math.floor(thickness / 2); oy <= Math.floor(thickness / 2); oy++) {
      for (let ox = -Math.floor(thickness / 2); ox <= Math.floor(thickness / 2); ox++) {
        ctx.fillRect(x + ox, y + oy, 1, 1);
      }
    }
  }
}

export function findNearestNode(
  nodes: Node[],
  worldP: { x: number; y: number },
  radiusM = 0.25,
): Node | null {
  let best: Node | null = null;
  let bestD = radiusM;
  for (const n of nodes) {
    const d = Math.hypot(n.x - worldP.x, n.y - worldP.y);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

export function findNearestBeam(
  beams: Beam[],
  nodesById: Record<string, Node>,
  worldP: { x: number; y: number },
  radiusM = 0.22,
): Beam | null {
  let best: Beam | null = null;
  let bestD = radiusM;
  for (const b of beams) {
    const A = nodesById[b.a];
    const B = nodesById[b.b];
    if (!A || !B) continue;
    const d = pointSegmentDistance(worldP, A, B);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

export function beamExists(beams: Beam[], a: string, b: string): boolean {
  return beams.some((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
}

export function getInitialNodes(): Node[] {
  // Position nodes so road plank top surface (plank half-height is 0.06) is flush with platform (y=2.6)
  const roadNodeY = 2.6 - 0.06; // Plank center should be below platform so top is flush
  // Extend anchors slightly onto the platform for smooth transition
  const left: Node = { id: 'L', x: 5.5, y: roadNodeY, anchor: true };
  const right: Node = { id: 'R', x: 18.5, y: roadNodeY, anchor: true };
  // Keep mid nodes at same Y level as anchors for a flat deck, only snap X
  const mid1: Node = { id: 'M1', x: snap((left.x + right.x) / 2 - 3, GRID), y: roadNodeY, anchor: false };
  const mid2: Node = { id: 'M2', x: snap((left.x + right.x) / 2 + 3, GRID), y: roadNodeY, anchor: false };
  return [left, right, mid1, mid2];
}

export function getInitialBeams(): Beam[] {
  return [
    { id: makeId('b'), a: 'L', b: 'M1', mat: 'road' },
    { id: makeId('b'), a: 'M1', b: 'M2', mat: 'road' },
    { id: makeId('b'), a: 'M2', b: 'R', mat: 'road' },
  ];
}
