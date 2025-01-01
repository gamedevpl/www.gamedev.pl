import {
  PREY_SPEED,
  PREY_VISION_ANGLE,
  PREY_VISION_RANGE,
  FLEE_DURATION,
  FLEE_DISTANCE,
  PreyState,
} from './prey-types';
import { GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT } from './game-world-consts';
import { LionState, Vector2D, GameWorldState } from './game-world-types';
import { devConfig } from '../dev/dev-config';
import { normalizeVector, getDistance } from './coordinate-utils';
import { spawnPrey } from './prey-spawner';
import { DEFAULT_PREY_SPAWN_CONFIG } from './prey-init';

/**
 * Updates all prey in the game world
 */
export function updateAllPrey(state: GameWorldState, deltaTime: number): PreyState[] {
  // Update all prey entities with lion's state
  let updatedPrey = state.prey.map((p) => updatePrey(p, deltaTime, state.lion));

  // Spawn new prey entities if needed
  if (state.time % DEFAULT_PREY_SPAWN_CONFIG.spawnInterval < deltaTime) {
    updatedPrey = spawnPrey(DEFAULT_PREY_SPAWN_CONFIG, updatedPrey);
  }

  return updatedPrey;
}

/**
 * Updates a single prey's state
 */
function updatePrey(prey: PreyState, deltaTime: number, lion: LionState): PreyState {
  const secondsDelta = deltaTime / 1000;
  const currentTime = Date.now();

  // Check if prey is being caught
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

  // Check if prey should stop fleeing
  if (prey.fleeingUntil && currentTime > prey.fleeingUntil) {
    const distanceToLion = getDistance(prey.position, lion.position);
    if (distanceToLion > FLEE_DISTANCE) {
      prey.state = 'idle';
      prey.fleeingUntil = undefined;
      prey.movement.speed = 0;
    }
  }

  // Update prey based on its current state
  switch (prey.state) {
    case 'idle':
      handleIdleState(prey);
      break;
    case 'moving':
      handleMovingState(prey, secondsDelta);
      break;
    case 'fleeing':
      handleFleeingState(prey, secondsDelta);
      break;
  }

  // Check if the prey should start or continue fleeing
  const distanceToLion = getDistance(prey.position, lion.position);
  const shouldStartFleeing = checkShouldStartFleeing(prey, lion, distanceToLion);

  if (shouldStartFleeing || prey.state === 'fleeing') {
    if (prey.state !== 'fleeing') {
      startFleeing(prey, lion, currentTime);
    }
    updatePosition(prey, secondsDelta);
  }

  // Add debug information for dev mode
  if (devConfig.debugFleeingState) {
    prey.safeDistanceReached = distanceToLion > FLEE_DISTANCE;
  }

  return prey;
}

/**
 * Handles prey behavior in idle state
 */
function handleIdleState(prey: PreyState): void {
  // Randomly decide to start moving
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

  // Randomly decide to stop moving
  if (Math.random() < 0.01) {
    prey.state = 'idle';
    prey.movement.speed = 0;
  }
}

/**
 * Handles prey behavior in fleeing state
 */
function handleFleeingState(prey: PreyState, secondsDelta: number): void {
  prey.visionDirection = { ...prey.movement.direction };
  updatePosition(prey, secondsDelta);
}

/**
 * Initiates fleeing behavior for prey
 */
function startFleeing(prey: PreyState, lion: LionState, currentTime: number): void {
  const fleeDirection = getFleeingDirection(prey, lion);
  prey.movement.direction = addRandomness(fleeDirection, 0.3);
  prey.movement.speed = PREY_SPEED;
  prey.state = 'fleeing';
  prey.fleeingUntil = currentTime + FLEE_DURATION;
}

/**
 * Checks if prey should start fleeing from the lion
 */
function checkShouldStartFleeing(prey: PreyState, lion: LionState, distance: number): boolean {
  if (distance > PREY_VISION_RANGE) return false;

  // Check if lion is moving towards the prey
  if (lion.movement.isMoving) {
    const lionDirection = normalizeVector({
      x: lion.position.x - prey.position.x,
      y: lion.position.y - prey.position.y,
    });

    // Calculate angle between prey's vision direction and lion's position
    const angle = Math.acos(
      (prey.visionDirection.x * lionDirection.x + prey.visionDirection.y * lionDirection.y) /
        (Math.sqrt(prey.visionDirection.x * prey.visionDirection.x + prey.visionDirection.y * prey.visionDirection.y) *
          Math.sqrt(lionDirection.x * lionDirection.x + lionDirection.y * lionDirection.y)),
    );

    // Prey sees the lion if it's within vision angle or very close
    return angle < PREY_VISION_ANGLE / 2 || distance < PREY_VISION_RANGE * 0.5;
  }

  return false;
}

/**
 * Updates prey position and handles world boundaries
 */
function updatePosition(prey: PreyState, secondsDelta: number): void {
  prey.position.x += prey.movement.direction.x * prey.movement.speed * secondsDelta;
  prey.position.y += prey.movement.direction.y * prey.movement.speed * secondsDelta;

  // Bounce off edges with slight direction variation
  if (prey.position.x < 0 || prey.position.x > GAME_WORLD_WIDTH) {
    prey.movement.direction.x *= -1;
    prey.movement.direction = addRandomness(prey.movement.direction, 0.2);
  }
  if (prey.position.y < 0 || prey.position.y > GAME_WORLD_HEIGHT) {
    prey.movement.direction.y *= -1;
    prey.movement.direction = addRandomness(prey.movement.direction, 0.2);
  }
}

/**
 * Calculates fleeing direction away from lion
 */
function getFleeingDirection(prey: PreyState, lion: LionState): Vector2D {
  return normalizeVector({
    x: prey.position.x - lion.position.x,
    y: prey.position.y - lion.position.y,
  });
}

/**
 * Adds random variation to a direction vector
 */
function addRandomness(direction: Vector2D, amount: number): Vector2D {
  const randomAngle = (Math.random() - 0.5) * amount * Math.PI;
  const cos = Math.cos(randomAngle);
  const sin = Math.sin(randomAngle);
  return normalizeVector({
    x: direction.x * cos - direction.y * sin,
    y: direction.x * sin + direction.y * cos,
  });
}

/**
 * Generates a random direction vector
 */
function getRandomDirection(): Vector2D {
  const angle = Math.random() * Math.PI * 2;
  return {
    x: Math.cos(angle),
    y: Math.sin(angle),
  };
}
