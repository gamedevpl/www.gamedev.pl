import { PREY_VISION_ANGLE, PREY_VISION_RANGE, PreyState } from './prey-types';
import { LionState } from './game-world-types';
import { normalizeVector, getDistance, calculateAngleBetweenVectors } from './coordinate-utils';

/**
 * Checks if prey should start fleeing from the lion
 */
export function checkShouldStartFleeing(prey: PreyState, lion: LionState, distance: number): boolean {
  if (distance > PREY_VISION_RANGE) return false;

  // Check if lion is moving towards the prey
  if (lion.movement.isMoving) {
    const lionDirection = normalizeVector({
      x: lion.position.x - prey.position.x,
      y: lion.position.y - prey.position.y,
    });

    // Calculate angle between prey's vision direction and lion's position
    const angle = calculateAngleBetweenVectors(prey.visionDirection, lionDirection);

    // Prey sees the lion if it's within vision angle or very close
    return angle < PREY_VISION_ANGLE / 2 || distance < PREY_VISION_RANGE * 0.5;
  }

  return false;
}

/**
 * Detects nearby prey that are in a fleeing state
 */
export function detectNearbyFleeingPrey(prey: PreyState, allPrey: PreyState[]): PreyState | null {
  for (const otherPrey of allPrey) {
    if (otherPrey.id === prey.id) continue;
    if (otherPrey.state !== 'fleeing') continue;

    const distance = getDistance(prey.position, otherPrey.position);
    if (distance > PREY_VISION_RANGE) continue;

    const direction = normalizeVector({
      x: otherPrey.position.x - prey.position.x,
      y: otherPrey.position.y - prey.position.y,
    });

    // Calculate angle between prey's vision direction and other prey's position
    const angle = calculateAngleBetweenVectors(prey.visionDirection, direction);

    // Check if the fleeing prey is within vision angle
    if (angle < PREY_VISION_ANGLE / 2) {
      return otherPrey;
    }
  }

  return null;
}
