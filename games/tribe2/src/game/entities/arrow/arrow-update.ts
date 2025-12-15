import { ArrowEntity } from './arrow-types';
import { UpdateContext } from '../../world-types';
import { removeEntity } from '../entities-update';
import {
  ARROW_GRAVITY,
  ARROW_EMBEDDED_DURATION_HOURS,
  ARROW_MAX_FLIGHT_TIME_HOURS,
} from './arrow-consts';

/**
 * Updates an arrow entity's physics each frame.
 * Handles gravity, position updates, world wrapping, and embedding.
 */
export function updateArrow(arrow: ArrowEntity, context: UpdateContext): void {
  const { gameState, deltaTime } = context;
  const deltaSeconds = deltaTime / 1000;

  // Handle embedded arrows
  if (arrow.isEmbedded) {
    // Check if embedded arrow should be removed
    if (
      arrow.embeddedTime !== undefined &&
      arrow.embeddedTime + ARROW_EMBEDDED_DURATION_HOURS < gameState.time
    ) {
      removeEntity(gameState.entities, arrow.id);
    }
    return;
  }

  // Flying arrow logic
  // Convert deltaTime (ms) to hours for age tracking (1 hour = 3600000ms)
  const deltaHours = deltaTime / 3600000;
  arrow.age += deltaHours;

  // Check if arrow has exceeded max flight time
  if (arrow.age > ARROW_MAX_FLIGHT_TIME_HOURS) {
    removeEntity(gameState.entities, arrow.id);
    return;
  }

  // Apply gravity to vertical velocity
  arrow.vz -= ARROW_GRAVITY * deltaSeconds;

  // Update position
  arrow.position.x += arrow.vx * deltaSeconds;
  arrow.position.y += arrow.vy * deltaSeconds;

  // Handle toroidal world wrapping
  arrow.position.x =
    ((arrow.position.x % gameState.mapDimensions.width) + gameState.mapDimensions.width) %
    gameState.mapDimensions.width;
  arrow.position.y =
    ((arrow.position.y % gameState.mapDimensions.height) + gameState.mapDimensions.height) %
    gameState.mapDimensions.height;

  // Check if arrow hit the ground (vz represents height, when it goes negative arrow hits ground)
  if (arrow.vz <= 0) {
    arrow.isEmbedded = true;
    arrow.embeddedTime = gameState.time;
    arrow.vx = 0;
    arrow.vy = 0;
    arrow.vz = 0;
  }
}
