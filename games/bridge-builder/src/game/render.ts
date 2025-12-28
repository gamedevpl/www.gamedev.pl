import { VIEW_W, VIEW_H, MATERIALS, PALETTE, LEVEL } from './constants';
import { Node, Beam, Camera } from './types';
import { WorldSimulation } from './physics';
import { worldToView, drawPixelLine } from './utils';
import planck from 'planck';

const Vec2 = planck.Vec2;

// Seeded random for deterministic rendering
let seed = 1337;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

function resetRand(): void {
  seed = 1337;
}

/**
 * Render the background (sky, clouds, platforms)
 */
export function renderBackground(ctx: CanvasRenderingContext2D, cam: Camera): void {
  // Background sky gradient
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  for (let y = 0; y < VIEW_H; y++) {
    const t = y / VIEW_H;
    ctx.fillStyle = t < 0.5 ? PALETTE.sky1 : PALETTE.sky2;
    ctx.fillRect(0, y, VIEW_W, 1);
  }

  // Clouds (deterministic pixel blobs)
  resetRand();
  ctx.fillStyle = PALETTE.cloud;
  const cloud = (cx: number, cy: number, w: number) => {
    for (let i = 0; i < 20; i++) {
      const x = cx + Math.floor((rand() - 0.5) * w);
      const y = cy + Math.floor((rand() - 0.5) * (w * 0.35));
      ctx.fillRect(x, y, 7, 3);
    }
  };
  cloud(90, 46, 110);
  cloud(320, 58, 140);

  // Level geometry (cliffs/platform)
  const drawPlatform = (x0: number, x1: number, y: number, topColor: string, sideColor: string) => {
    const A = worldToView(Vec2(x0, y), cam);
    const B = worldToView(Vec2(x1, y), cam);
    // top grass
    ctx.fillStyle = topColor;
    ctx.fillRect(Math.floor(A.x), Math.floor(A.y) - 3, Math.floor(B.x - A.x), 3);
    // cliff body
    const floor = worldToView(Vec2(x0, LEVEL.floorY), cam);
    ctx.fillStyle = sideColor;
    ctx.fillRect(Math.floor(A.x), Math.floor(A.y), Math.floor(B.x - A.x), Math.floor(floor.y - A.y));
    // little texture
    ctx.fillStyle = PALETTE.cliff2;
    for (let i = 0; i < 80; i++) {
      const x = Math.floor(A.x + rand() * (B.x - A.x));
      const y2 = Math.floor(A.y + rand() * (floor.y - A.y));
      if ((x + y2) % 7 === 0) ctx.fillRect(x, y2, 2, 1);
    }
  };

  drawPlatform(LEVEL.worldMinX, LEVEL.gapStart, LEVEL.platformY, PALETTE.grass, PALETTE.cliff);
  drawPlatform(LEVEL.gapEnd, LEVEL.worldMaxX, LEVEL.platformY, PALETTE.grass, PALETTE.cliff);

  // Void floor line
  ctx.fillStyle = '#10151b';
  const f0 = worldToView(Vec2(LEVEL.gapStart, LEVEL.floorY), cam);
  const f1 = worldToView(Vec2(LEVEL.gapEnd, LEVEL.floorY), cam);
  drawPixelLine(ctx, Math.floor(f0.x), Math.floor(f0.y), Math.floor(f1.x), Math.floor(f1.y), 2);
}

/**
 * Render the build mode (nodes and beams in design mode)
 */
export function renderBuild(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  nodes: Node[],
  beams: Beam[],
  nodesById: Record<string, Node>,
  selectedNodeId: string | null,
  lastPointerWorld: { x: number; y: number } | null,
): void {
  // Beams
  for (const b of beams) {
    const A = nodesById[b.a];
    const B = nodesById[b.b];
    if (!A || !B) continue;
    const p0 = worldToView(Vec2(A.x, A.y), cam);
    const p1 = worldToView(Vec2(B.x, B.y), cam);
    ctx.fillStyle = MATERIALS[b.mat].color;
    const thick = b.mat === 'road' ? 3 : 2;
    drawPixelLine(ctx, Math.floor(p0.x), Math.floor(p0.y), Math.floor(p1.x), Math.floor(p1.y), thick);

    if (b.mat === 'road') {
      // rails highlight
      ctx.fillStyle = '#b8c2cc';
      drawPixelLine(ctx, Math.floor(p0.x), Math.floor(p0.y) - 2, Math.floor(p1.x), Math.floor(p1.y) - 2, 1);
    }
  }

  // Nodes
  for (const n of nodes) {
    const p = worldToView(Vec2(n.x, n.y), cam);
    const r = n.anchor ? 4 : 3;
    ctx.fillStyle = n.anchor ? '#ffd28a' : '#d7e3ff';
    ctx.fillRect(Math.floor(p.x) - r, Math.floor(p.y) - r, r * 2, r * 2);
    ctx.fillStyle = '#1b2430';
    ctx.fillRect(Math.floor(p.x) - 1, Math.floor(p.y) - 1, 2, 2);

    if (n.id === selectedNodeId) {
      ctx.fillStyle = '#fffb';
      drawPixelLine(ctx, Math.floor(p.x) - 7, Math.floor(p.y) - 7, Math.floor(p.x) + 7, Math.floor(p.y) - 7, 1);
      drawPixelLine(ctx, Math.floor(p.x) - 7, Math.floor(p.y) + 7, Math.floor(p.x) + 7, Math.floor(p.y) + 7, 1);
    }
  }

  // Ghost line if a node is selected
  if (selectedNodeId && lastPointerWorld) {
    const A = nodesById[selectedNodeId];
    if (A) {
      const p0 = worldToView(Vec2(A.x, A.y), cam);
      const p1 = worldToView(lastPointerWorld, cam);
      ctx.fillStyle = '#ffffff66';
      drawPixelLine(ctx, Math.floor(p0.x), Math.floor(p0.y), Math.floor(p1.x), Math.floor(p1.y), 1);
    }
  }

  // Overlay grid hints
  ctx.fillStyle = '#00000022';
  for (let x = 0; x < VIEW_W; x += 12) ctx.fillRect(x, 0, 1, VIEW_H);
  for (let y = 0; y < VIEW_H; y += 12) ctx.fillRect(0, y, VIEW_W, 1);
}

/**
 * Render the simulation mode
 */
export function renderSim(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  beams: Beam[],
  sim: WorldSimulation,
): void {
  // Beams (from sim state)
  const beamById = new Map(sim.simBeams.map((b) => [b.id, b]));

  // draw distance beams
  for (const b of beams) {
    const sb = beamById.get(b.id);
    if (!sb) continue;
    const A = sim.nodeBodies.get(b.a);
    const B = sim.nodeBodies.get(b.b);
    if (!A || !B) continue;
    const pA = worldToView(A.getPosition(), cam);
    const pB = worldToView(B.getPosition(), cam);

    const base = MATERIALS[b.mat].color;
    ctx.fillStyle = sb.broken ? '#2a2f36' : base;
    const thick = b.mat === 'road' ? 3 : 2;
    drawPixelLine(ctx, Math.floor(pA.x), Math.floor(pA.y), Math.floor(pB.x), Math.floor(pB.y), thick);

    if (!sb.broken && b.mat === 'road') {
      ctx.fillStyle = '#c7d2dd';
      drawPixelLine(ctx, Math.floor(pA.x), Math.floor(pA.y) - 2, Math.floor(pB.x), Math.floor(pB.y) - 2, 1);
    }
  }

  // Draw road planks
  for (const sb of sim.simBeams) {
    if (sb.kind !== 'road' || !sb.plankBody) continue;
    const body = sb.plankBody;
    const pos = body.getPosition();
    const a = body.getAngle();

    const L = 1.6;
    const dx = Math.cos(a) * L;
    const dy = Math.sin(a) * L;
    const p0 = worldToView(Vec2(pos.x - dx, pos.y - dy), cam);
    const p1 = worldToView(Vec2(pos.x + dx, pos.y + dy), cam);

    ctx.fillStyle = sb.broken ? '#242a31' : PALETTE.track;
    drawPixelLine(ctx, Math.floor(p0.x), Math.floor(p0.y), Math.floor(p1.x), Math.floor(p1.y), 4);
  }

  // Nodes
  for (const [nodeId, body] of sim.nodeBodies) {
    const node = sim.nodeBodies.get(nodeId);
    if (!node) continue;
    const p = worldToView(body.getPosition(), cam);
    const isAnchor = body.getType() === 'static';
    const r = isAnchor ? 4 : 3;
    ctx.fillStyle = isAnchor ? '#ffd28a' : '#d7e3ff';
    ctx.fillRect(Math.floor(p.x) - r, Math.floor(p.y) - r, r * 2, r * 2);
    ctx.fillStyle = '#1b2430';
    ctx.fillRect(Math.floor(p.x) - 1, Math.floor(p.y) - 1, 2, 2);
  }

  // Train sprites
  const drawCar = (body: planck.Body, isLoco: boolean) => {
    const pos = body.getPosition();
    const center = worldToView(pos, cam);

    const w = 52;
    const h = 18;

    const stampRect = (cx: number, cy: number, w2: number, h2: number, fill: string, outline: string) => {
      ctx.fillStyle = fill;
      ctx.fillRect(cx - w2 / 2, cy - h2 / 2, w2, h2);
      ctx.fillStyle = outline;
      drawPixelLine(ctx, cx - w2 / 2, cy - h2 / 2, cx + w2 / 2, cy - h2 / 2, 1);
      drawPixelLine(ctx, cx - w2 / 2, cy + h2 / 2, cx + w2 / 2, cy + h2 / 2, 1);
    };

    stampRect(Math.floor(center.x), Math.floor(center.y), w, h, isLoco ? '#d04b4b' : '#3a5ea8', '#0c1016');

    // window / stripe
    ctx.fillStyle = isLoco ? '#ffcc66' : '#b3c6ff';
    ctx.fillRect(Math.floor(center.x) - 16, Math.floor(center.y) - 6, 12, 6);
    ctx.fillStyle = '#00000033';
    ctx.fillRect(Math.floor(center.x) - 25, Math.floor(center.y) + 2, 50, 2);

    // smokestack
    if (isLoco) {
      ctx.fillStyle = '#2b3038';
      ctx.fillRect(Math.floor(center.x) + 14, Math.floor(center.y) - 14, 6, 10);
      // smoke
      ctx.fillStyle = '#ffffff55';
      const px = Math.floor(center.x) + 18;
      const py = Math.floor(center.y) - 20;
      ctx.fillRect(px, py, 4, 4);
      ctx.fillRect(px + 6, py - 4, 3, 3);
    }
  };

  for (let i = 0; i < sim.train.cars.length; i++) {
    drawCar(sim.train.cars[i], i === 0);
  }

  // Wheels
  for (const w of sim.train.wheels) {
    const p = worldToView(w.getPosition(), cam);
    ctx.fillStyle = '#1b2026';
    ctx.fillRect(Math.floor(p.x) - 5, Math.floor(p.y) - 5, 10, 10);
    ctx.fillStyle = '#cfd6df';
    ctx.fillRect(Math.floor(p.x) - 1, Math.floor(p.y) - 1, 2, 2);
  }

  // Outcome overlay
  if (sim.outcome) {
    const win = sim.outcome === 'win';
    ctx.fillStyle = win ? '#00000088' : '#00000099';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = win ? PALETTE.good : PALETTE.bad;
    const txt = win ? 'SUCCESS' : 'COLLAPSED';
    const x0 = Math.floor(VIEW_W / 2 - txt.length * 9);
    const y0 = Math.floor(VIEW_H / 2 - 8);
    for (let i = 0; i < txt.length; i++) {
      ctx.fillRect(x0 + i * 18, y0, 12, 16);
      ctx.fillStyle = '#0b1220';
      ctx.fillRect(x0 + i * 18 + 3, y0 + 3, 6, 10);
      ctx.fillStyle = win ? PALETTE.good : PALETTE.bad;
    }
    ctx.fillStyle = PALETTE.text;
    ctx.fillRect(Math.floor(VIEW_W / 2) - 70, Math.floor(VIEW_H / 2) + 30, 140, 14);
    ctx.fillStyle = '#0b1220';
    drawPixelLine(
      ctx,
      Math.floor(VIEW_W / 2) - 70,
      Math.floor(VIEW_H / 2) + 30,
      Math.floor(VIEW_W / 2) + 70,
      Math.floor(VIEW_H / 2) + 30,
      1,
    );
    drawPixelLine(
      ctx,
      Math.floor(VIEW_W / 2) - 70,
      Math.floor(VIEW_H / 2) + 44,
      Math.floor(VIEW_W / 2) + 70,
      Math.floor(VIEW_H / 2) + 44,
      1,
    );
  }
}
