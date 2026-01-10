import { Entity } from '../entities/entities-types';
import { Vector2D } from '../utils/math-types';
import { VisualEffect } from '../visual-effects/visual-effect-types';
import { GameWorldState } from '../world-types';
import { CharacterEntity } from '../entities/characters/character-types';
import { getCurrentTask } from '../ai/task/task-utils';
import { getDirectionVectorOnTorus } from '../utils/math-utils';

/**
 * Converts screen coordinates to world coordinates, taking into account viewport position and map wrapping.
 * @param screenPos The position on the canvas.
 * @param viewportCenter The center of the viewport in world coordinates.
 * @param canvasDimensions The width and height of the canvas.
 * @param mapDimensions The width and height of the game map.
 * @returns The corresponding world coordinates.
 */
export function screenToWorldCoords(
  screenPos: Vector2D,
  viewportCenter: Vector2D,
  canvasDimensions: { width: number; height: number },
  mapDimensions: { width: number; height: number },
): Vector2D {
  const worldX = viewportCenter.x - canvasDimensions.width / 2;
  const worldY = viewportCenter.y - canvasDimensions.height / 2;
  const absoluteWorldX = worldX + screenPos.x;
  const absoluteWorldY = worldY + screenPos.y;
  const wrappedX = ((absoluteWorldX % mapDimensions.width) + mapDimensions.width) % mapDimensions.width;
  const wrappedY = ((absoluteWorldY % mapDimensions.height) + mapDimensions.height) % mapDimensions.height;
  return { x: wrappedX, y: wrappedY };
}

/**
 * Converts world coordinates to screen coordinates, taking into account viewport position and map wrapping.
 * @param worldPos The position in the game world.
 * @param viewportCenter The center of the viewport in world coordinates.
 * @param canvasDimensions The width and height of the canvas.
 * @param mapDimensions The width and height of the game map.
 * @returns The corresponding screen coordinates.
 */
export function worldToScreenCoords(
  worldPos: Vector2D,
  viewportCenter: Vector2D,
  canvasDimensions: { width: number; height: number },
  mapDimensions: { width: number; height: number },
): Vector2D {
  let dx = worldPos.x - viewportCenter.x;
  let dy = worldPos.y - viewportCenter.y;

  // Handle horizontal wrapping to find the shortest path
  if (Math.abs(dx) > mapDimensions.width / 2) {
    dx = dx - Math.sign(dx) * mapDimensions.width;
  }

  // Handle vertical wrapping
  if (Math.abs(dy) > mapDimensions.height / 2) {
    dy = dy - Math.sign(dy) * mapDimensions.height;
  }

  return {
    x: dx + canvasDimensions.width / 2,
    y: dy + canvasDimensions.height / 2,
  };
}

/**
 * Checks if an entity is within the visible viewport (frustum culling).
 * @param entity The entity to check.
 * @param viewportCenter The center of the viewport in world coordinates.
 * @param canvasDimensions The dimensions of the canvas.
 * @param mapDimensions The dimensions of the game world.
 * @returns True if the entity is at least partially visible, false otherwise.
 */
export function isEntityInView(
  entity: Entity | VisualEffect,
  viewportCenter: Vector2D,
  canvasDimensions: { width: number; height: number },
  mapDimensions: { width: number; height: number },
): boolean {
  const screenPos = worldToScreenCoords(entity.position, viewportCenter, canvasDimensions, mapDimensions);

  // Use the entity's radius, or a default if it's not present (e.g., for some visual effects)
  const radius = 'radius' in entity ? entity.radius : 20;
  const margin = radius + 20; // Add a margin to avoid culling things just off-screen

  return (
    screenPos.x >= -margin &&
    screenPos.x <= canvasDimensions.width + margin &&
    screenPos.y >= -margin &&
    screenPos.y <= canvasDimensions.height + margin
  );
}

/**
 * Renders an entity or visual effect with wrapping around the game world boundaries.
 * @param ctx The canvas rendering context.
 * @param worldWidth The width of the game world.
 * @param worldHeight The height of the game world.
 * @param renderFn The rendering function to call for each wrapped position.
 * @param entity The entity or visual effect to render.
 * @param args Additional arguments to pass to the render function.
 */
export function renderWithWrapping<T extends Entity | VisualEffect>(
  ctx: CanvasRenderingContext2D,
  worldWidth: number,
  worldHeight: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderFn: (ctx: CanvasRenderingContext2D, entity: T, ...args: any[]) => void,
  entity: T,
  ...args: unknown[]
): void {
  const originalPosition = { ...entity.position };

  for (let dy = -worldHeight; dy <= worldHeight; dy += worldHeight) {
    for (let dx = -worldWidth; dx <= worldWidth; dx += worldWidth) {
      entity.position.x = originalPosition.x + dx;
      entity.position.y = originalPosition.y + dy;
      renderFn(ctx, entity, ...args);
    }
  }

  entity.position = originalPosition;
}

/**
 * Creates a new offscreen canvas of the specified dimensions and returns it along with its 2D context.
 * @param width The width of the canvas.
 * @param height The height of the canvas.
 * @returns An object containing the canvas and its context.
 */
export function getOffscreenCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D context for offscreen canvas');
  }
  return { canvas, ctx };
}

/**
 * A simple pseudo-random number generator based on an input seed.
 * Returns a number between 0 and 1.
 * This ensures visual elements look "random" but don't jitter every frame.
 * @param seed The input seed.
 * @returns A pseudo-random number between 0 and 1.
 */
export function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/**
 * Snaps a value to the nearest step.
 * @param value The value to snap.
 * @param steps The number of steps (e.g., 12 for animation frames).
 * @returns The snapped value.
 */
export function snapToStep(value: number, steps: number): number {
  return Math.round(value * steps) / steps;
}

/**
 * Discretizes a direction vector into a step index.
 * @param direction The 2D direction vector.
 * @param steps The number of directions (e.g., 8 for cardinal/intercardinal).
 * @returns An integer step index from 0 to steps - 1.
 */
export function discretizeDirection(direction: Vector2D, steps: number = 8): number {
  const angle = Math.atan2(direction.y, direction.x);
  const normalizedAngle = (angle + Math.PI * 2) % (Math.PI * 2);
  return Math.round((normalizedAngle / (Math.PI * 2)) * steps) % steps;
}

/**
 * Converts a discretized direction step back into a unit vector.
 * @param step The step index.
 * @param steps The total number of steps.
 * @returns A unit vector [x, y].
 */
export function getDiscretizedDirectionVector(step: number, steps: number = 8): [number, number] {
  const angle = (step / steps) * Math.PI * 2;
  return [Math.cos(angle), Math.sin(angle)];
}

/**
 * Renders a debug highlight for the character's current target.
 * Shows a dashed line to the target and a marker at the target position.
 */
export function renderDebugTargetHighlight(
  ctx: CanvasRenderingContext2D,
  character: CharacterEntity,
  gameState: GameWorldState,
): void {
  const { width, height } = gameState.mapDimensions;
  let targetPos: Vector2D | undefined;
  let targetEntityId: number | undefined;

  // 1. Try to get target from the entity's target property (movement target)
  // We use 'any' cast here to safely access properties that might exist on specific subtypes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const char = character as any;
  if (char.target) {
    if (typeof char.target === 'object' && 'x' in char.target && 'y' in char.target) {
      targetPos = char.target as Vector2D;
    } else if (typeof char.target === 'number') {
      targetEntityId = char.target;
      targetPos = gameState.entities.entities[char.target]?.position;
    }
  }

  // 2. If no target yet, try to get it from the current task (intended target)
  if (!targetPos) {
    const currentTaskId = getCurrentTask(character);
    const currentTask = currentTaskId ? gameState.tasks[currentTaskId] : null;
    if (currentTask && currentTask.target) {
      if (typeof currentTask.target === 'object' && 'x' in currentTask.target && 'y' in currentTask.target) {
        targetPos = currentTask.target as Vector2D;
      } else if (typeof currentTask.target === 'number') {
        targetEntityId = currentTask.target;
        targetPos = gameState.entities.entities[currentTask.target]?.position;
      }
    }
  }

  if (!targetPos) return;

  ctx.save();

  // Draw dashed line from character to target (shortest path on torus)
  const dir = getDirectionVectorOnTorus(character.position, targetPos, width, height);
  const endPos = { x: character.position.x + dir.x, y: character.position.y + dir.y };

  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = 'rgba(255, 165, 0, 0.5)'; // Semi-transparent orange
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(character.position.x, character.position.y);
  ctx.lineTo(endPos.x, endPos.y);
  ctx.stroke();

  // Draw target marker
  if (targetEntityId) {
    const targetEntity = gameState.entities.entities[targetEntityId];
    if (targetEntity) {
      // Highlight the target entity with a pulsing orange circle
      // Logic inlined from renderEntityHighlight to avoid circular dependency
      const pulseSpeed = 5;
      const pulse = (Math.sin(gameState.time * pulseSpeed) + 1) / 2;
      const currentLineWidth = 2 + pulse * 2;

      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(endPos.x, endPos.y, targetEntity.radius + 5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)';
      ctx.lineWidth = currentLineWidth;
      ctx.stroke();
    }
  } else {
    // Draw crosshair at target position
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255, 165, 0, 0.9)';
    ctx.lineWidth = 2;
    const size = 10;

    ctx.beginPath();
    ctx.moveTo(endPos.x - size, endPos.y);
    ctx.lineTo(endPos.x + size, endPos.y);
    ctx.moveTo(endPos.x, endPos.y - size);
    ctx.lineTo(endPos.x, endPos.y + size);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(endPos.x, endPos.y, size * 0.7, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}
