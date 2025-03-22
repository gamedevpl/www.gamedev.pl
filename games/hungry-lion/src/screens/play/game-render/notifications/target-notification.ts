import { LionEntity } from '../../game-world/entities/entities-types';
import { getEntityById } from '../../game-world/game-world-query';
import { GameWorldState } from '../../game-world/game-world-types';
import { Vector2D } from '../../game-world/utils/math-types';

/**
 * Draws an icon on the target entity or position
 * @param ctx Canvas rendering context
 * @param lion The lion entity with target information
 */
export function drawTargetIcon(ctx: CanvasRenderingContext2D, gameState: GameWorldState, lion: LionEntity) {
  // Only draw if the lion has a target (either entity or position)
  if (!lion.target.entityId && !lion.target.position) {
    return;
  }

  // Get target position and type
  const targetPosition = getTargetPosition(gameState, lion);
  const targetType = getTargetType(gameState, lion);

  if (!targetPosition) {
    return; // No valid position to draw at
  }

  // Create pulsing effect using sine wave
  const time = Date.now() / 600; // Control pulse speed
  const alpha = 0.7 + 0.3 * Math.sin(time); // Alpha varies between 0.7 and 1.0
  const scale = 0.9 + 0.2 * Math.sin(time * 1.5); // Size pulse effect

  // Draw the appropriate icon based on target type
  ctx.save();

  switch (targetType) {
    case 'prey':
      drawCrosshairIcon(ctx, targetPosition.x, targetPosition.y, alpha, scale);
      break;
    case 'carrion':
      drawFoodIcon(ctx, targetPosition.x, targetPosition.y, alpha, scale);
      break;
    case 'position':
    default:
      drawPositionMarker(ctx, targetPosition.x, targetPosition.y, alpha, scale);
      break;
  }

  ctx.restore();
}

/**
 * Determines the position of the lion's target
 */
function getTargetPosition(gameState: GameWorldState, lion: LionEntity): Vector2D | null {
  if (lion.target.entityId) {
    const position = getEntityById(gameState, lion.target.entityId)?.position;
    return position || null;
  }

  // If targeting a position directly, use that
  if (lion.target.position) {
    return lion.target.position;
  }

  // If targeting an entity, need to find the entity
  // Since we don't have direct access to the entity map here,
  // we'll rely on the entityId and trust that the lion's target exists
  // The actual position will be determined in the game world

  // For now, we'll return null if we can't determine the position
  // This would be improved if we had access to the entities map
  return null;
}

/**
 * Determines the type of the lion's target
 */
function getTargetType(gameState: GameWorldState, lion: LionEntity): 'prey' | 'carrion' | 'position' | null {
  if (lion.target.entityId) {
    const entityType = getEntityById(gameState, lion.target.entityId)?.type;

    if (entityType === 'prey') {
      return 'prey';
    } else if (entityType === 'carrion') {
      return 'carrion';
    }
  }

  // If targeting a position, return 'position'
  if (lion.target.position) {
    return 'position';
  }

  return null;
}

/**
 * Draws a crosshair icon for prey targets
 */
function drawCrosshairIcon(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number, scale: number) {
  const size = 15 * scale;

  ctx.strokeStyle = `rgba(255, 50, 50, ${alpha})`;
  ctx.lineWidth = 2;

  // Draw outer circle
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.stroke();

  // Draw inner circle
  ctx.beginPath();
  ctx.arc(x, y, size / 3, 0, Math.PI * 2);
  ctx.stroke();

  // Draw crosshair lines
  ctx.beginPath();
  // Horizontal line
  ctx.moveTo(x - size, y);
  ctx.lineTo(x + size, y);
  // Vertical line
  ctx.moveTo(x, y - size);
  ctx.lineTo(x, y + size);
  ctx.stroke();
}

/**
 * Draws a food icon for carrion targets
 */
function drawFoodIcon(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number, scale: number) {
  const size = 12 * scale;

  ctx.fillStyle = `rgba(150, 100, 50, ${alpha})`;
  ctx.strokeStyle = `rgba(100, 50, 0, ${alpha})`;
  ctx.lineWidth = 2;

  // Draw main circle (meat)
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Draw bone cross
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.lineWidth = 3;

  // X shape for bone
  ctx.beginPath();
  ctx.moveTo(x - size / 2, y - size / 2);
  ctx.lineTo(x + size / 2, y + size / 2);
  ctx.moveTo(x + size / 2, y - size / 2);
  ctx.lineTo(x - size / 2, y + size / 2);
  ctx.stroke();
}

/**
 * Draws a position marker for position targets
 */
function drawPositionMarker(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number, scale: number) {
  const size = 10 * scale;

  ctx.strokeStyle = `rgba(50, 150, 255, ${alpha})`;
  ctx.lineWidth = 2;

  // Draw X marker
  ctx.beginPath();
  ctx.moveTo(x - size, y - size);
  ctx.lineTo(x + size, y + size);
  ctx.moveTo(x + size, y - size);
  ctx.lineTo(x - size, y + size);
  ctx.stroke();

  // Draw circle around X
  ctx.beginPath();
  ctx.arc(x, y, size * 1.4, 0, Math.PI * 2);
  ctx.stroke();
}
