import { GameWorldState } from '../game-world/game-world-types';
import { renderFireball } from './fireball-renderer';

/**
 * Render the game world
 */
export function renderGame(ctx: CanvasRenderingContext2D, world: GameWorldState): void {
  // Save initial context state
  ctx.save();

  // Clear the canvas with a dark background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Get the center of the viewport
  const centerX = ctx.canvas.width / 2;
  const centerY = ctx.canvas.height / 2;

  // Calculate time-based size and intensity variations
  const time = world.time / 1000;
  const baseSize = 100;
  const sizeVariation = 5 * Math.cos(time * Math.PI * 2);

  // Setup for additive blending of multiple fireballs
  ctx.save();
  ctx.globalCompositeOperation = 'lighten';

  // Render test fireballs with different properties to demonstrate blending
  // First fireball: Regular intensity
  renderFireball(ctx, world, {
    x: centerX - 30,
    y: centerY - 30,
    size: baseSize + sizeVariation,
    intensity: 0.9,
    glow: 0.2,
  });

  // Second fireball: Higher intensity and glow
  renderFireball(ctx, world, {
    x: centerX + 30,
    y: centerY + 30,
    size: baseSize + sizeVariation * 0.8,
    intensity: 1.0,
    glow: 0.5,
  });

  // Third fireball: Lower intensity, higher glow for variety
  renderFireball(ctx, world, {
    x: centerX - 30,
    y: centerY + 30,
    size: baseSize * 1.5 + sizeVariation * 1.2,
    intensity: 1,
    glow: 0.1,
  });

  // Restore the composite operation state
  ctx.restore();

  // Restore initial context state
  ctx.restore();
}
