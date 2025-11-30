import { GameWorldState, EntityType } from '../types/world-types';
import { Vector2D } from '../types/math-types';
import { projectToScreen, getWrappedEntityPositions } from './render-utils';
import {
  HEIGHT_MAP_RESOLUTION,
  SAND_LEVEL,
  GRASS_LEVEL,
  ROCK_LEVEL,
  SNOW_LEVEL,
} from '../constants/world-constants';

// Debug colors
const DEBUG_COLORS = {
  WATER: '#1a4480',
  SAND: '#d2b48c',
  GRASS: '#2d5a27',
  ROCK: '#666666',
  SNOW: '#ffffff',
  BACKGROUND: '#111111',
  TEXT: '#00ff00',
  ENTITY_DEFAULT: '#ff00ff',
  ENTITY_TREE: '#00aa00',
  ENTITY_RABBIT: '#ffffff',
  ENTITY_BUILDING: '#ffaa00',
};

/**
 * Renders the game in a simplified debug mode.
 * Focuses on gameplay information over visual fidelity.
 */
export function renderDebugGame(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  viewportCenter: Vector2D,
  viewportZoom: number,
  canvasDimensions: { width: number; height: number },
  deltaTime: number,
): void {
  // 1. Clear Canvas
  ctx.fillStyle = DEBUG_COLORS.BACKGROUND;
  ctx.fillRect(0, 0, canvasDimensions.width, canvasDimensions.height);

  // 2. Render Terrain Grid
  // Optimization: Only render the center instance for terrain to avoid massive overdraw in debug mode
  // unless we really need to see wrapping. For now, let's render just the visible range if possible,
  // or just the main map to keep it simple as requested.
  // Actually, to see wrapping logic working, we should probably use the wrapping logic but maybe simplified.
  // Let's try rendering the grid points as small rectangles.

  const { heightMap, mapDimensions } = gameState;
  const gridH = heightMap.length;
  const gridW = heightMap[0]?.length ?? 0;
  const cellSize = HEIGHT_MAP_RESOLUTION * viewportZoom;

  // Optimization: Calculate visible range in world coordinates
  // This is a rough approximation to avoid iterating the whole map if zoomed in
  // For debug mode, we can just iterate all if map isn't huge (3000px / 50 = 60x60 = 3600 cells).
  // 3600 cells is fine to iterate.

  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const height = heightMap[y][x];
      let color = DEBUG_COLORS.WATER;
      if (height > SNOW_LEVEL) color = DEBUG_COLORS.SNOW;
      else if (height > ROCK_LEVEL) color = DEBUG_COLORS.ROCK;
      else if (height > GRASS_LEVEL) color = DEBUG_COLORS.GRASS;
      else if (height > SAND_LEVEL) color = DEBUG_COLORS.SAND;

      const worldPos = { x: x * HEIGHT_MAP_RESOLUTION, y: y * HEIGHT_MAP_RESOLUTION };
      
      // Use wrapping to show the world correctly
      const wrappedPositions = getWrappedEntityPositions(worldPos, viewportCenter, mapDimensions);

      wrappedPositions.forEach((pos) => {
        const screenPos = projectToScreen(pos, viewportCenter, viewportZoom, canvasDimensions);
        
        // Simple culling
        if (
          screenPos.x < -cellSize ||
          screenPos.x > canvasDimensions.width + cellSize ||
          screenPos.y < -cellSize ||
          screenPos.y > canvasDimensions.height + cellSize
        ) {
          return;
        }

        ctx.fillStyle = color;
        // Draw slightly smaller than cell size to see grid lines
        ctx.fillRect(screenPos.x - cellSize / 2 + 1, screenPos.y - cellSize / 2 + 1, cellSize - 2, cellSize - 2);
        
        // Optional: Draw height value text if zoomed in enough
        if (viewportZoom > 1.5) {
          ctx.fillStyle = '#000';
          ctx.font = '10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(height.toFixed(2), screenPos.x, screenPos.y + 3);
        }
      });
    }
  }

  // 3. Render Entities
  gameState.entities.entities.forEach((entity) => {
    const wrappedPositions = getWrappedEntityPositions(entity.position, viewportCenter, mapDimensions);

    wrappedPositions.forEach((pos) => {
      const screenPos = projectToScreen(pos, viewportCenter, viewportZoom, canvasDimensions);

      // Culling
      const radius = entity.radius * viewportZoom;
      if (
        screenPos.x < -radius ||
        screenPos.x > canvasDimensions.width + radius ||
        screenPos.y < -radius ||
        screenPos.y > canvasDimensions.height + radius
      ) {
        return;
      }

      // Draw Entity Shape
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
      
      let color = DEBUG_COLORS.ENTITY_DEFAULT;
      switch (entity.type) {
        case EntityType.TREE: color = DEBUG_COLORS.ENTITY_TREE; break;
        case EntityType.RABBIT: color = DEBUG_COLORS.ENTITY_RABBIT; break;
        case EntityType.BUILDING: color = DEBUG_COLORS.ENTITY_BUILDING; break;
      }
      
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw Direction Vector (if moving)
      if (entity.velocity.x !== 0 || entity.velocity.y !== 0) {
        ctx.beginPath();
        ctx.moveTo(screenPos.x, screenPos.y);
        ctx.lineTo(
          screenPos.x + entity.direction.x * radius * 2,
          screenPos.y - entity.direction.y * radius * 2 // Invert Y for screen
        );
        ctx.strokeStyle = '#ff0000';
        ctx.stroke();
      }

      // Draw Label
      ctx.fillStyle = DEBUG_COLORS.TEXT;
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${entity.type} #${entity.id}`, screenPos.x, screenPos.y - radius - 5);
      
      // Draw State (if available)
      if (entity.behaviorTree) {
         // Just a placeholder if we had state info easily accessible
         // ctx.fillText(`State: ...`, screenPos.x, screenPos.y - radius - 15);
      }
    });
  });

  // 4. Render Overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(10, 10, 250, 150);
  
  ctx.fillStyle = DEBUG_COLORS.TEXT;
  ctx.font = '14px monospace';
  ctx.textAlign = 'left';
  
  let y = 30;
  const lineHeight = 20;
  
  ctx.fillText(`=== DEBUG MODE ===`, 20, y); y += lineHeight;
  ctx.fillText(`FPS: ${Math.round(1 / deltaTime)}`, 20, y); y += lineHeight;
  ctx.fillText(`Entities: ${gameState.entities.entities.size}`, 20, y); y += lineHeight;
  ctx.fillText(`Time: ${gameState.time.toFixed(2)}s`, 20, y); y += lineHeight;
  ctx.fillText(`Zoom: ${viewportZoom.toFixed(2)}`, 20, y); y += lineHeight;
  
  const metrics = gameState.performanceMetrics.currentBucket;
  if (metrics) {
    ctx.fillText(`Update: ${metrics.worldUpdateTime.toFixed(2)}ms`, 20, y); y += lineHeight;
    ctx.fillText(`Render: ${metrics.renderTime.toFixed(2)}ms`, 20, y); y += lineHeight;
  }
}
