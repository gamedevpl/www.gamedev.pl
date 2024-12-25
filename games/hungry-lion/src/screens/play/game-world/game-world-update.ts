import { GameWorldState, LION_MAX_SPEED, Vector2D } from './game-world-types';
import { gameSoundController } from '../sound/game-sound-controller';

export function updateGameWorld(state: GameWorldState, deltaTime: number) {
  state.time += deltaTime;

  if (state.gameOver) {
    gameSoundController.cleanup();
    return state;
  }

  updateLionMovement(state, deltaTime);
  gameSoundController.update();

  return state;
}

const ACCELERATION = LION_MAX_SPEED;
const DECELERATION = LION_MAX_SPEED * 2;

function updateLionMovement(state: GameWorldState, deltaTime: number) {
  const { lion } = state;
  const secondsDelta = deltaTime / 1000;

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

  const dx = lion.targetPosition.x - lion.position.x;
  const dy = lion.targetPosition.y - lion.position.y;
  const distanceToTarget = Math.sqrt(dx * dx + dy * dy);

  lion.movement.direction = normalizeVector({ x: dx, y: dy });

  if (distanceToTarget < 1) {
    lion.targetPosition = null;
    lion.movement.isMoving = false;
    lion.movement.speed = 0;
    return;
  }

  lion.movement.isMoving = true;

  if (lion.movement.speed === 0) {
    lion.movement.speed = 50;
  } else {
    lion.movement.speed = Math.min(LION_MAX_SPEED, lion.movement.speed + ACCELERATION * secondsDelta);
  }

  const moveDistance = lion.movement.speed * secondsDelta;
  lion.position.x += lion.movement.direction.x * moveDistance;
  lion.position.y += lion.movement.direction.y * moveDistance;
}

function normalizeVector(vector: Vector2D): Vector2D {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  if (length === 0) return { x: 0, y: 0 };
  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}