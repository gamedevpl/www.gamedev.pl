import { GameWorldState } from '../game-world/game-world-types';
import { RenderState } from './render-state';
import { drawGround } from './ground-renderer';
import { renderPrey } from './entity-renderers/prey-renderer';
import { renderDebugInfo } from './debug-renderer';
import { getLions, getPrey, getCarrion, getHunters } from '../game-world/game-world-query';
import { drawLion } from './entity-renderers/lion-renderer';
import { drawCarrion } from './entity-renderers/carrion-renderer';
import { drawHunter } from './entity-renderers/hunter-renderer';
import { renderEnvironment } from './environment-renderer';
import { drawAllNotifications } from './notifications/combat-notification';
import { GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT } from '../game-world/game-world-consts';
import { Entity } from '../game-world/entities/entities-types';

// Helper function to draw an entity potentially multiple times for wrapping
const drawWrappedEntity = (
  ctx: CanvasRenderingContext2D,
  world: GameWorldState,
  entity: Entity,
  renderState: RenderState,
  drawFn: (ctx: CanvasRenderingContext2D, world: GameWorldState | Entity, entity?: Entity) => void,
) => {
  const { viewport } = renderState;
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;

  // Define offsets for wrapping (0, +world_dim, -world_dim)
  const offsetsX = [0, GAME_WORLD_WIDTH, -GAME_WORLD_WIDTH];
  const offsetsY = [0, GAME_WORLD_HEIGHT, -GAME_WORLD_HEIGHT];

  // Assume a max entity size for visibility check (adjust if needed)
  const entityRadius = 50; // Rough estimate

  for (const ox of offsetsX) {
    for (const oy of offsetsY) {
      // Calculate the entity's potential draw position in world coordinates, adjusted by offset
      const entityWorldX = entity.position.x + ox;
      const entityWorldY = entity.position.y + oy;

      // Calculate the entity's position in canvas coordinates
      const canvasX = entityWorldX + viewport.x;
      const canvasY = entityWorldY + viewport.y;

      // Basic visibility check: Check if the entity's bounding box potentially overlaps the canvas
      if (
        canvasX + entityRadius > 0 &&
        canvasX - entityRadius < canvasWidth &&
        canvasY + entityRadius > 0 &&
        canvasY - entityRadius < canvasHeight
      ) {
        // Draw the entity at the offset world position
        // The context is already translated by the viewport, so we draw relative to that
        // We need to pass the *original* entity state but modify the position for the renderer
        // or ensure the renderer uses the absolute offset position.
        // Let's pass the original entity and let the specific renderer handle drawing at the correct offset.
        // We need a way to tell the renderer *where* to draw this instance.

        // Option: Temporarily modify entity position (less clean)
        // const originalPos = { ...entity.position };
        // entity.position = { x: entityWorldX, y: entityWorldY };
        // drawFn(ctx, world, entity); // Assumes drawFn uses entity.position
        // entity.position = originalPos;

        // Option B: Pass offset position to renderer (cleaner if renderers support it)
        // This requires modifying drawLion, renderPrey, etc.
        // drawFn(ctx, world, entity, { x: entityWorldX, y: entityWorldY });

        // Option C: Draw relative to the current transform (Simplest)
        // Since ctx is translated by (viewport.x, viewport.y), drawing at (entityWorldX, entityWorldY)
        // should place it correctly on the canvas.
        // The specific render functions need to accept the absolute position to draw at.

        // Let's try modifying the entity passed to the draw function temporarily.
        // This avoids changing all renderer signatures immediately.
        const tempEntity = { ...entity, position: { x: entityWorldX, y: entityWorldY } };

        // Adjust drawFn call based on its expected signature
        if (entity.type === 'lion') {
          drawFn(ctx, world, tempEntity); // drawLion expects world and lion
        } else {
          // renderPrey, drawCarrion, drawHunter expect ctx and entity
          drawFn(ctx, tempEntity as any, undefined as any);
        }
      }
    }
  }
};

export const renderGame = (ctx: CanvasRenderingContext2D, world: GameWorldState, renderState: RenderState) => {
  const { viewport } = renderState;

  ctx.save();

  // Clear canvas (optional, depending on background drawing)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Draw the wrapping ground first
  drawGround(ctx, renderState);

  // Apply viewport translation ONCE for all subsequent draws
  ctx.translate(viewport.x, viewport.y);

  // Render environment with wrapping
  // Pass renderState and canvas dimensions needed for wrapping calculations
  renderEnvironment(ctx, world.environment, renderState, ctx.canvas.width, ctx.canvas.height);

  // Render all carrion entities with wrapping
  getCarrion(world).forEach((c) => drawWrappedEntity(ctx, world, c, renderState, drawCarrion as any));

  // Render all prey entities with wrapping
  getPrey(world).forEach((p) => drawWrappedEntity(ctx, world, p, renderState, renderPrey as any));

  // Render all hunters with wrapping
  getHunters(world).forEach((h) => drawWrappedEntity(ctx, world, h, renderState, drawHunter as any));

  // Render all lions with wrapping
  getLions(world).forEach((lion) => drawWrappedEntity(ctx, world, lion, renderState, drawLion as any));

  // Render all notifications (relative to viewport is usually fine)
  drawAllNotifications(ctx, world);

  // Render debug information (relative to viewport)
  renderDebugInfo(ctx, world);

  // Restore context to remove viewport translation
  ctx.restore();
};
