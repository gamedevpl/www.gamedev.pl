import { Entity } from "../entities/entities-types";

/**
 * Renders a pulsing, dashed-line circle highlight around a game entity.
 * This can be used for tutorials, notifications, or other visual cues.
 *
 * @param ctx The canvas rendering context.
 * @param entity The entity to highlight.
 * @param radius The base radius of the highlight circle.
 * @param color The color of the highlight.
 * @param lineWidth The base width of the highlight line.
 * @param pulseSpeed The speed of the pulsing animation.
 * @param time The current game time, used for the animation.
 */
export function renderEntityHighlight(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  radius: number,
  color: string,
  lineWidth: number,
  pulseSpeed: number,
  time: number,
): void {
  ctx.save();
  const { position } = entity;

  ctx.strokeStyle = color;
  // Pulsing effect for line width, amplitude is half of the base lineWidth
  ctx.lineWidth = lineWidth + Math.sin(time * pulseSpeed) * (lineWidth / 2);
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.arc(position.x, position.y, radius, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}
