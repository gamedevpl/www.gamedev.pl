import { TreeEntity } from '../entities/plants/tree/tree-types';
import {
  TREE_GROWTH_TIME_GAME_HOURS,
  TREE_TRUNK_COLOR_DARK,
  TREE_TRUNK_COLOR_MID,
  TREE_FOLIAGE_COLOR_BORDER,
  TREE_FOLIAGE_COLOR_MAIN,
  TREE_FOLIAGE_COLOR_LIGHT,
  TREE_SHADOW_COLOR,
} from '../entities/plants/tree/tree-consts';
import { TREE_FALLEN, TREE_STUMP } from '../entities/plants/tree/states/tree-state-types';

const SWAY_SPEED = 0.001;
const SWAY_AMPLITUDE = 0.05; // Radians

export function renderTree(ctx: CanvasRenderingContext2D, tree: TreeEntity, time: number): void {
  const { position, age, swayOffset } = tree;
  const [state] = tree.stateMachine ?? [];

  // 1. Calculate growth scale
  const growthScale = Math.min(1, Math.max(0.4, age / TREE_GROWTH_TIME_GAME_HOURS));

  // 2. Calculate sway
  const isStanding = state !== TREE_FALLEN && state !== TREE_STUMP;
  const swayAngle = isStanding ? Math.sin(time * SWAY_SPEED + swayOffset) * SWAY_AMPLITUDE : 0;

  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.scale(growthScale, growthScale);

  // 3. Draw Shadow
  ctx.save();
  ctx.scale(1, 0.4); // Flatten vertical axis
  ctx.transform(1, 0, -0.5, 1, 0, 0); // Skew
  ctx.fillStyle = TREE_SHADOW_COLOR;
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 4. Draw Trunk and Canopy based on state
  if (state === TREE_STUMP) {
    drawTrunk(ctx, 10, 8); // Just the base
  } else if (state === TREE_FALLEN) {
    ctx.rotate(Math.PI / 2); // Lie down
    drawTrunk(ctx, 10, 30);
    ctx.translate(0, -25);
    drawCanopy(ctx, 40, 20, 40, 15);
  } else {
    // Standing tree
    ctx.rotate(swayAngle);
    drawTrunk(ctx, 10, 30);

    // Canopy
    ctx.translate(0, -25);
    ctx.rotate(swayAngle * 0.5);
    drawCanopy(ctx, 40, 20, 40, 15);
  }

  ctx.restore();
}

function drawTrunk(ctx: CanvasRenderingContext2D, trunkWidth: number, trunkHeight: number) {
  // Dark part (Left)
  ctx.fillStyle = TREE_TRUNK_COLOR_DARK;
  ctx.beginPath();
  ctx.moveTo(-trunkWidth / 2, 0);
  ctx.lineTo(0, 0);
  ctx.lineTo(0, -trunkHeight);
  ctx.lineTo(-trunkWidth / 2, -trunkHeight + 5); // Slightly tapered
  ctx.closePath();
  ctx.fill();

  // Mid part (Right)
  ctx.fillStyle = TREE_TRUNK_COLOR_MID;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(trunkWidth / 2, 0);
  ctx.lineTo(trunkWidth / 2, -trunkHeight + 5);
  ctx.lineTo(0, -trunkHeight);
  ctx.closePath();
  ctx.fill();
}

function drawCanopy(
  ctx: CanvasRenderingContext2D,
  baseWidth: number,
  topWidth: number,
  height: number,
  peakHeight: number,
) {
  // Draw Canopy Border (Largest)
  ctx.fillStyle = TREE_FOLIAGE_COLOR_BORDER;
  drawCanopyShape(ctx, baseWidth + 4, topWidth + 4, height + 2, peakHeight + 2);

  // Draw Main Foliage
  ctx.translate(0, -2); // Slight offset up
  ctx.fillStyle = TREE_FOLIAGE_COLOR_MAIN;
  drawCanopyShape(ctx, baseWidth, topWidth, height, peakHeight);

  // Draw Highlights (Simple Shapes)
  ctx.fillStyle = TREE_FOLIAGE_COLOR_LIGHT;
  // Left highlight
  ctx.beginPath();
  ctx.moveTo(-10, -20);
  ctx.lineTo(-5, -30);
  ctx.lineTo(-15, -30);
  ctx.fill();

  // Right highlight
  ctx.beginPath();
  ctx.moveTo(10, -10);
  ctx.lineTo(15, -20);
  ctx.lineTo(5, -20);
  ctx.fill();
}

function drawCanopyShape(
  ctx: CanvasRenderingContext2D,
  baseWidth: number,
  topWidth: number,
  height: number,
  peakHeight: number,
) {
  ctx.beginPath();
  // Bottom Left
  ctx.moveTo(-baseWidth / 2, 0);
  // Top Left (start of peak)
  ctx.lineTo(-topWidth / 2, -height);
  // Peak
  ctx.lineTo(0, -height - peakHeight);
  // Top Right
  ctx.lineTo(topWidth / 2, -height);
  // Bottom Right
  ctx.lineTo(baseWidth / 2, 0);
  ctx.closePath();
  ctx.fill();
}
