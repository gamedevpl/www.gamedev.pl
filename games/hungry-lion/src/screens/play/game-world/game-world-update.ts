import { GameWorldState, LION_MAX_SPEED, Vector2D } from './game-world-types';
import { gameSoundController } from '../sound/game-sound-controller';

const ACCELERATION = LION_MAX_SPEED; // units per second^2
const DECELERATION = LION_MAX_SPEED * 2; // units per second^2

function normalizeVector(vector: Vector2D): Vector2D {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  if (length === 0) return { x: 0, y: 0 };
  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function updateLionMovement(state: GameWorldState, deltaTime: number) {
  const { lion } = state;
  const secondsDelta = deltaTime / 1000;

  // If there's no target, decelerate and stop
  if (!lion.targetPosition) {
    if (lion.movement.speed > 0) {
      lion.movement.speed = Math.max(0, lion.movement.speed - DECELERATION * secondsDelta);
      if (lion.movement.speed === 0) {
        lion.movement.isMoving = false;
        lion.movement.direction = { x: 0, y: 0 };
      }
    }
    return;
  }

  // Calculate direction to target
  const dx = lion.targetPosition.x - lion.position.x;
  const dy = lion.targetPosition.y - lion.position.y;
  const distanceToTarget = Math.sqrt(dx * dx + dy * dy);

  // Update direction
  lion.movement.direction = normalizeVector({ x: dx, y: dy });

  // If we're close enough to target, stop
  if (distanceToTarget < 1) {
    lion.targetPosition = null;
    lion.movement.isMoving = false;
    lion.movement.speed = 0;
    return;
  }

  // Update movement state
  lion.movement.isMoving = true;

  // Handle continuous movement
  if (lion.movement.speed === 0) {
    // Initial speed when starting continuous movement
    lion.movement.speed = 50;
  } else {
    // Gradually increase speed when moving
    lion.movement.speed = Math.min(LION_MAX_SPEED, lion.movement.speed + ACCELERATION * secondsDelta);
  }

  // Apply continuous movement
  const moveDistance = lion.movement.speed * secondsDelta;
  lion.position.x += lion.movement.direction.x * moveDistance;
  lion.position.y += lion.movement.direction.y * moveDistance;
}

/**
 * Updates game world state for a single frame
 */
export function updateGameWorld(state: GameWorldState, deltaTime: number) {
  // Update time
  state.time += deltaTime;

  // Skip updates if game is over
  if (state.gameOver) {
    // Clean up sounds when game is over
    gameSoundController.cleanup();
    return state;
  }

  // Update lion movement
  updateLionMovement(state, deltaTime);

  // Update sound controller with current game state
  gameSoundController.update();

  return state;
}
