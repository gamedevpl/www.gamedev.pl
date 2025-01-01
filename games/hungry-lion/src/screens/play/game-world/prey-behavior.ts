import { PreyState, FleeingSource, FLEE_DISTANCE, PREY_SPEED, FLEE_DURATION } from './prey-types';
import { Vector2D } from './game-world-types';
import {
  normalizeVector,
  getDistance,
  addRandomness,
  getRandomDirection,
  handleBoundaryBounce,
} from './coordinate-utils';
import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from './game-world-consts';

/**
 * Updates prey state based on its current state and threats
 */
export function updatePreyState(prey: PreyState, deltaTime: number): PreyState {
  const secondsDelta = deltaTime / 1000;
  const currentTime = Date.now();

  // Handle being caught
  if (prey.isBeingCaught) {
    prey.movement.speed = Math.max(0, prey.movement.speed - 10 * secondsDelta);
    if (prey.movement.speed === 0) {
      prey.isCaught = true;
      prey.isBeingCaught = false;
      prey.isCarrion = true;
      prey.carrionTime = currentTime;
    }
    return prey;
  }

  // Handle fleeing state
  if (prey.fleeingUntil && currentTime > prey.fleeingUntil) {
    if (prey.fleeingSource) {
      const distanceToThreat = getDistance(prey.position, prey.fleeingSource.position);
      if (distanceToThreat > FLEE_DISTANCE) {
        prey.state = 'idle';
        prey.fleeingUntil = undefined;
        prey.fleeingSource = undefined;
        prey.movement.speed = 0;
      }
    }
  }

  // Handle state transitions
  switch (prey.state) {
    case 'idle':
      handleIdleState(prey);
      break;
    case 'moving':
      handleMovingState(prey, secondsDelta);
      break;
    case 'fleeing':
      handleFleeingState(prey);
      break;
  }

  return prey;
}

/**
 * Handles prey behavior in idle state
 */
function handleIdleState(prey: PreyState): void {
  if (Math.random() < 0.01) {
    prey.state = 'moving';
    prey.movement.direction = getRandomDirection();
    prey.movement.speed = PREY_SPEED * 0.5;
    prey.visionDirection = { ...prey.movement.direction };
  }
}

/**
 * Handles prey behavior in moving state
 */
function handleMovingState(prey: PreyState, secondsDelta: number): void {
  updatePosition(prey, secondsDelta);

  if (Math.random() < 0.01) {
    prey.state = 'idle';
    prey.movement.speed = 0;
  }
}

/**
 * Handles prey behavior in fleeing state
 */
function handleFleeingState(prey: PreyState): void {
  if (prey.fleeingSource) {
    const fleeDirection = getFleeingDirection(prey.position, prey.fleeingSource.position);
    prey.movement.direction = addRandomness(fleeDirection, 0.2);
  }
  prey.visionDirection = { ...prey.movement.direction };
}

/**
 * Initiates fleeing behavior for prey
 */
export function startFleeing(prey: PreyState, source: FleeingSource, currentTime: number): void {
  const fleeDirection = getFleeingDirection(prey.position, source.position);
  prey.movement.direction = addRandomness(fleeDirection, 0.3);
  prey.movement.speed = PREY_SPEED * (source.type === 'lion' ? 1.5 : 1.2);
  prey.state = 'fleeing';
  prey.fleeingUntil = currentTime + FLEE_DURATION;
  prey.fleeingSource = source;
}

/**
 * Gets fleeing direction away from a position
 */
function getFleeingDirection(preyPosition: Vector2D, threatPosition: Vector2D): Vector2D {
  return normalizeVector({
    x: preyPosition.x - threatPosition.x,
    y: preyPosition.y - threatPosition.y,
  });
}

/**
 * Updates prey position and handles world boundaries
 */
function updatePosition(prey: PreyState, secondsDelta: number) {
  prey.position.x += prey.movement.direction.x * prey.movement.speed * secondsDelta;
  prey.position.y += prey.movement.direction.y * prey.movement.speed * secondsDelta;

  // Handle boundary bouncing using the new coordinate-utils module
  prey.movement.direction = handleBoundaryBounce(
    prey.position,
    prey.movement.direction,
    GAME_WORLD_WIDTH,
    GAME_WORLD_HEIGHT,
  );
}
