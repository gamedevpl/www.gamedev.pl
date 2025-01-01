import {
  PREY_SPEED,
  PREY_VISION_ANGLE,
  PREY_VISION_RANGE,
  FLEE_DURATION,
  FLEE_DISTANCE,
  PreyState,
} from './prey-types';
import { GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT } from './game-world-consts';
import { LionState, Vector2D } from './game-world-types';
import { devConfig } from '../dev/dev-config';

export function updatePrey(prey: PreyState, deltaTime: number, lion: LionState): PreyState {
  const secondsDelta = deltaTime / 1000;
  const currentTime = Date.now();

  // Check if prey should stop fleeing
  if (prey.fleeingUntil && currentTime > prey.fleeingUntil) {
    const distanceToLion = getDistance(prey.position, lion.position);
    if (distanceToLion > FLEE_DISTANCE) {
      prey.state = 'idle';
      prey.fleeingUntil = undefined;
      prey.movement.speed = 0;
    }
  }

  if (prey.state === 'idle') {
    // Randomly decide to start moving
    if (Math.random() < 0.01) {
      prey.state = 'moving';
      prey.movement.direction = getRandomDirection();
      prey.movement.speed = PREY_SPEED * 0.5;
      prey.visionDirection = { ...prey.movement.direction };
    }
  } else if (prey.state === 'moving') {
    // Update position based on movement
    updatePosition(prey, secondsDelta);

    // Randomly decide to stop moving
    if (Math.random() < 0.01) {
      prey.state = 'idle';
      prey.movement.speed = 0;
    }
  }

  // Check if the prey should start or continue fleeing
  const distanceToLion = getDistance(prey.position, lion.position);
  const shouldStartFleeing = checkShouldStartFleeing(prey, lion, distanceToLion);

  if (shouldStartFleeing || prey.state === 'fleeing') {
    if (shouldStartFleeing) {
      // Update fleeing direction with some randomness
      const fleeDirection = getFleeingDirection(prey, lion);
      prey.movement.direction = addRandomness(fleeDirection, 0.3);
      prey.movement.speed = PREY_SPEED * 1.5;
    }

    if (prey.state !== 'fleeing') {
      // Start fleeing
      prey.state = 'fleeing';
      prey.fleeingUntil = currentTime + FLEE_DURATION;
    }
    prey.visionDirection = { ...prey.movement.direction };

    // Update position with fleeing movement
    updatePosition(prey, secondsDelta);
  }

  // Add debug information for dev mode
  if (devConfig.debugFleeingState) {
    prey.safeDistanceReached = distanceToLion > FLEE_DISTANCE;
  }

  return prey;
}

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

function updatePosition(prey: PreyState, secondsDelta: number) {
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

function getFleeingDirection(prey: PreyState, lion: LionState): Vector2D {
  return normalizeVector({
    x: prey.position.x - lion.position.x,
    y: prey.position.y - lion.position.y,
  });
}

function addRandomness(direction: Vector2D, amount: number): Vector2D {
  const randomAngle = (Math.random() - 0.5) * amount * Math.PI;
  const cos = Math.cos(randomAngle);
  const sin = Math.sin(randomAngle);
  return normalizeVector({
    x: direction.x * cos - direction.y * sin,
    y: direction.x * sin + direction.y * cos,
  });
}

function getRandomDirection(): Vector2D {
  const angle = Math.random() * Math.PI * 2;
  return {
    x: Math.cos(angle),
    y: Math.sin(angle),
  };
}

function getDistance(pos1: Vector2D, pos2: Vector2D): number {
  const dx = pos2.x - pos1.x;
  const dy = pos2.y - pos1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function normalizeVector(vector: Vector2D): Vector2D {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  if (length === 0) return { x: 0, y: 0 };
  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}
