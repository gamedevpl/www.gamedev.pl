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

const SWAY_SPEED = 0.001;
const SWAY_AMPLITUDE = 0.05; // Radians

export function renderTree(ctx: CanvasRenderingContext2D, tree: TreeEntity, time: number): void {
  const { position, age, swayOffset } = tree;

  // 1. Calculate growth scale
  const growthScale = Math.min(1, Math.max(0.4, age / TREE_GROWTH_TIME_GAME_HOURS));

  // 2. Calculate sway
  const swayAngle = Math.sin(time * SWAY_SPEED + swayOffset) * SWAY_AMPLITUDE;

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

  // Apply sway rotation for the tree parts
  ctx.rotate(swayAngle);

  // 4. Draw Trunk
  const trunkWidth = 10;
  const trunkHeight = 30;

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

  // 5. Draw Canopy (Pentagonal / Trapezoid + Triangle)
  // Shift up to top of trunk
  ctx.translate(0, -trunkHeight + 5);
  // Sway canopy slightly more for effect? Let's keep it rigid with trunk for now as per simple 2D asset logic often used.
  // Or maybe a slight extra sway.
  ctx.rotate(swayAngle * 0.5);

  const canopyBaseWidth = 40;
  const canopyTopWidth = 20;
  const canopyHeight = 40;
  const canopyPeakHeight = 15;

  // Draw Canopy Border (Largest)
  ctx.fillStyle = TREE_FOLIAGE_COLOR_BORDER;
  drawCanopyShape(ctx, canopyBaseWidth + 4, canopyTopWidth + 4, canopyHeight + 2, canopyPeakHeight + 2);

  // Draw Main Foliage
  ctx.translate(0, -2); // Slight offset up
  ctx.fillStyle = TREE_FOLIAGE_COLOR_MAIN;
  drawCanopyShape(ctx, canopyBaseWidth, canopyTopWidth, canopyHeight, canopyPeakHeight);

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

  ctx.restore();
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
