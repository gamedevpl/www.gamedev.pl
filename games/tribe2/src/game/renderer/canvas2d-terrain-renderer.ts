import { BiomeType } from '../world-types';
import { Vector2D } from '../types/math-types';
import {
  GROUND_COLOR,
  GRASS_COLOR,
  ROCK_COLOR,
  SAND_COLOR,
  SNOW_COLOR,
} from '../constants/rendering-constants';
import {
  HEIGHT_MAP_RESOLUTION,
  SAND_LEVEL,
} from '../constants/world-constants';
import { projectToScreen, getWrappedEntityPositions } from './render-utils';

/**
 * Simple Canvas 2D terrain renderer that replaces WebGPU shader-based rendering.
 * Renders terrain with biome colors based on height and biome type.
 */
export function renderTerrain(
  ctx: CanvasRenderingContext2D,
  heightMap: number[][],
  biomeMap: BiomeType[][],
  mapDimensions: { width: number; height: number },
  viewportCenter: Vector2D,
  viewportZoom: number,
  canvasDimensions: { width: number; height: number },
): void {
  const gridH = heightMap.length;
  const gridW = heightMap[0]?.length ?? 0;
  const cellSize = HEIGHT_MAP_RESOLUTION * viewportZoom;

  // Iterate over terrain grid and render each cell
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const height = heightMap[y][x];
      const biome = biomeMap[y][x];
      
      // Determine color based on biome and height
      let color: string;
      switch (biome) {
        case BiomeType.GRASS:
          color = `rgb(${GRASS_COLOR.r * 255}, ${GRASS_COLOR.g * 255}, ${GRASS_COLOR.b * 255})`;
          break;
        case BiomeType.SAND:
          color = `rgb(${SAND_COLOR.r * 255}, ${SAND_COLOR.g * 255}, ${SAND_COLOR.b * 255})`;
          break;
        case BiomeType.ROCK:
          color = `rgb(${ROCK_COLOR.r * 255}, ${ROCK_COLOR.g * 255}, ${ROCK_COLOR.b * 255})`;
          break;
        case BiomeType.SNOW:
          color = `rgb(${SNOW_COLOR.r * 255}, ${SNOW_COLOR.g * 255}, ${SNOW_COLOR.b * 255})`;
          break;
        case BiomeType.GROUND:
        default:
          color = `rgb(${GROUND_COLOR.r * 255}, ${GROUND_COLOR.g * 255}, ${GROUND_COLOR.b * 255})`;
          break;
      }

      // Apply water color for areas below sand level
      if (height < SAND_LEVEL) {
        // Deep water is darker
        const waterDepth = Math.max(0, (SAND_LEVEL - height) / SAND_LEVEL);
        const brightness = 1 - waterDepth * 0.5;
        color = `rgb(${44 * brightness}, ${82 * brightness}, ${52 * brightness})`;
      }

      const worldPos = { x: x * HEIGHT_MAP_RESOLUTION, y: y * HEIGHT_MAP_RESOLUTION };
      
      // Handle world wrapping
      const wrappedPositions = getWrappedEntityPositions(worldPos, viewportCenter, mapDimensions);

      wrappedPositions.forEach((pos) => {
        const screenPos = projectToScreen(pos, viewportCenter, viewportZoom, canvasDimensions);
        
        // Simple culling - skip cells outside the viewport
        if (
          screenPos.x < -cellSize ||
          screenPos.x > canvasDimensions.width + cellSize ||
          screenPos.y < -cellSize ||
          screenPos.y > canvasDimensions.height + cellSize
        ) {
          return;
        }

        ctx.fillStyle = color;
        ctx.fillRect(screenPos.x, screenPos.y, cellSize, cellSize);
      });
    }
  }
}
