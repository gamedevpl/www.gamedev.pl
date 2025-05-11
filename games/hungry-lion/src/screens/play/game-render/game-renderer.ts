import { GameWorldState } from "../game-world/game-world-types";
import { RenderState } from "./render-state";
import { drawGround } from "./ground-renderer";
import { renderPrey } from "./entity-renderers/prey-renderer";
import { renderDebugInfo } from "./debug-renderer";
import {
  getLions,
  getPrey,
  getCarrion,
  getHunters,
} from "../game-world/game-world-query";
import { drawLion } from "./entity-renderers/lion-renderer";
import { drawCarrion } from "./entity-renderers/carrion-renderer";
import { drawHunter } from "./entity-renderers/hunter-renderer";
import { renderEnvironment } from "./environment-renderer";
import { drawAllNotifications } from "./notifications/combat-notification";
import {
  GAME_WORLD_WIDTH,
  GAME_WORLD_HEIGHT,
} from "../game-world/game-world-consts";
import { drawHungerIndicator } from "./hunger-renderer";
import { Entity } from "../game-world/entities/entities-types";
import { drawActionBar } from "./action-bar-renderer"; // Import the new action bar renderer

// Helper function to draw an entity potentially multiple times for wrapping
function drawWrappedEntity<T extends Entity>(
  ctx: CanvasRenderingContext2D,
  world: GameWorldState,
  entity: T,
  renderState: RenderState,
  drawFn: (ctx: CanvasRenderingContext2D, world: GameWorldState, entity: T) => void
) {
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
        // Let's try modifying the entity passed to the draw function temporarily.
        // This avoids changing all renderer signatures immediately.
        const tempEntity = { ...entity, position: { x: entityWorldX, y: entityWorldY } };

        drawFn(ctx, world, tempEntity);
      }
    }
  }
}

export const renderGame = (
  ctx: CanvasRenderingContext2D,
  world: GameWorldState,
  renderState: RenderState
) => {
  const { viewport } = renderState;
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;

  ctx.save();

  // Clear canvas (optional, depending on background drawing)
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // Draw the wrapping ground first
  drawGround(ctx, renderState);

  // Apply viewport translation ONCE for all subsequent draws
  ctx.translate(viewport.x, viewport.y);

  // Render environment with wrapping
  // Pass renderState and canvas dimensions needed for wrapping calculations
  renderEnvironment(ctx, world.environment, renderState, canvasWidth, canvasHeight);

  // Render all carrion entities with wrapping
  getCarrion(world).forEach((c) =>
    drawWrappedEntity(ctx, world, c, renderState, drawCarrion)
  );

  // Render all prey entities with wrapping
  getPrey(world).forEach((p) =>
    drawWrappedEntity(ctx, world, p, renderState, renderPrey)
  );

  // Render all hunters with wrapping
  getHunters(world).forEach((h) =>
    drawWrappedEntity(ctx, world, h, renderState, drawHunter)
  );

  // Render all lions with wrapping
  getLions(world).forEach((lion) =>
    drawWrappedEntity(ctx, world, lion, renderState, drawLion)
  );

  // Render all notifications (relative to viewport is usually fine)
  drawAllNotifications(ctx, world);

  // Render debug information (relative to viewport)
  renderDebugInfo(ctx, world);

  // Restore context to remove viewport translation
  ctx.restore();

  // --- Draw UI elements (like hunger indicator and action bar) in screen space AFTER restoring context ---
  drawHungerIndicator(ctx, world, canvasWidth, canvasHeight); // Pass canvas dimensions
  drawActionBar(ctx, world, canvasWidth, canvasHeight); // Draw the action bar
};
