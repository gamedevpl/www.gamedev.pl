import { GameWorldState, LION_MAX_SPEED } from './game-world-types';
import { normalizeVector } from './coordinate-utils';
import { PREY_SPEED } from './prey-types';
import { gameSoundController } from '../sound/game-sound-controller';

const ACCELERATION = LION_MAX_SPEED;
const DECELERATION = LION_MAX_SPEED * 2;

/**
 * Updates lion's state including movement, hunger and prey catching
 */
export function updateLion(state: GameWorldState, deltaTime: number): void {
  if (state.gameOver) {
    gameSoundController.cleanup();
    return;
  }

  updateLionMovement(state, deltaTime);
  updateLionHunger(state, deltaTime);
  handlePreyCatching(state, deltaTime);
}

/**
 * Updates lion's movement based on current state and target position
 */
function updateLionMovement(state: GameWorldState, deltaTime: number) {
  const { lion } = state;
  const secondsDelta = deltaTime / 1000;

  // Update target position if chasing prey
  if (lion.chaseTarget) {
    const targetPrey = state.prey.find((p) => p.id === lion.chaseTarget);
    if (targetPrey) {
      lion.targetPosition = { x: targetPrey.position.x, y: targetPrey.position.y };
    } else {
      // If target prey not found, stop chasing
      lion.chaseTarget = null;
      lion.targetPosition = null;
    }
  }

  // If there's no target position and the lion is moving, decelerate
  if (!lion.targetPosition && lion.movement.speed > 0) {
    lion.movement.speed = Math.max(0, lion.movement.speed - DECELERATION * secondsDelta);
    if (lion.movement.speed === 0) {
      lion.movement.isMoving = false;
      lion.movement.direction = { x: 0, y: 0 };
    }
    return;
  }

  // If there's a target position, calculate movement
  if (lion.targetPosition) {
    const dx = lion.targetPosition.x - lion.position.x;
    const dy = lion.targetPosition.y - lion.position.y;
    const distanceToTarget = Math.sqrt(dx * dx + dy * dy);

    // Update direction towards target
    lion.movement.direction = normalizeVector({ x: dx, y: dy });

    // If close to target and not chasing, stop moving
    if (distanceToTarget < 3) {
      lion.targetPosition = null;
      lion.movement.isMoving = false;
      lion.movement.speed = 0;
      return;
    }

    // Update movement state
    lion.movement.isMoving = true;

    // Adjust speed based on distance to target
    if (lion.movement.speed === 0) {
      lion.movement.speed = 50;
    } else {
      const speedFactor = Math.min(1, distanceToTarget / 100);
      lion.movement.speed = Math.min(LION_MAX_SPEED, lion.movement.speed + ACCELERATION * secondsDelta * speedFactor);
    }

    // Move lion towards target
    const moveDistance = lion.movement.speed * secondsDelta;
    lion.position.x += lion.movement.direction.x * moveDistance;
    lion.position.y += lion.movement.direction.y * moveDistance;
  }
}

/**
 * Updates lion's hunger state and checks for starvation
 */
function updateLionHunger(state: GameWorldState, deltaTime: number) {
  const { lion } = state;
  const hungerDecayRate = 1; // Hunger decreases by 0.1 per second
  lion.hunger.level = Math.max(0, lion.hunger.level - hungerDecayRate * (deltaTime / 1000));

  // Update hunger state flags
  lion.hunger.isStarving = lion.hunger.level <= 20;
  lion.hunger.isFull = lion.hunger.level >= 80;
  lion.hunger.isGluttonous = lion.hunger.level >= 100;

  // Check for starvation death
  if (lion.hunger.level <= 0) {
    state.gameOver = true;
    state.gameOverStats = {
      timeSurvived: state.time,
    };
  }
}

/**
 * Handles prey catching mechanics when lion is close to prey
 */
function handlePreyCatching(state: GameWorldState, deltaTime: number) {
  const { lion, prey } = state;
  const catchDistance = 80; // Distance within which the lion can catch prey
  const catchSpeedReduction = 1000; // Speed reduction per second when catching prey
  const eatDistance = 20; // Distance within which the lion can eat prey

  for (const p of prey) {
    const distance = Math.sqrt(
      Math.pow(p.position.x - lion.position.x, 2) + Math.pow(p.position.y - lion.position.y, 2),
    );

    if (distance < catchDistance) {
      // Reduce prey speed when being caught
      p.movement.speed = Math.max(0, p.movement.speed - catchSpeedReduction * (deltaTime / 1000));
      p.isBeingCaught = true;

      if (p.movement.speed === 0 && distance < eatDistance && p.isCarrion) {
        // Prey is caught and can be eaten
        lion.hunger.level = Math.min(100, lion.hunger.level + 10); // Increase hunger level
        lion.hunger.lastEatenTime = Date.now();
        state.prey = state.prey.filter((prey) => prey.id !== p.id); // Remove eaten prey
        lion.targetPosition = null; // Stop chasing after catching prey
        lion.chaseTarget = null; // Clear chase target after catching prey
      }
    } else if (p.isBeingCaught) {
      // Reset catching state if prey is no longer within catching distance
      p.isBeingCaught = false;
      p.movement.speed = PREY_SPEED;
    }
  }
}
