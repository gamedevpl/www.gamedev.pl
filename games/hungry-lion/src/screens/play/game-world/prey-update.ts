import { FLEE_DISTANCE, PreyState } from './prey-types';
import { GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT } from './game-world-consts';
import { LionState, GameWorldState } from './game-world-types';
import { devConfig } from '../dev/dev-config';
import { getDistance, handleBoundaryBounce } from './coordinate-utils';
import { spawnPrey } from './prey-spawner';
import { DEFAULT_PREY_SPAWN_CONFIG } from './prey-init';
import { startFleeing, updatePreyState } from './prey-behavior';
import { checkShouldStartFleeing, detectNearbyFleeingPrey } from './threat-detection';

/**
 * Updates all prey in the game world
 */
export function updateAllPrey(state: GameWorldState, deltaTime: number): PreyState[] {
  // Update all prey entities with lion's state and other prey states
  let updatedPrey = state.prey.map((p) => updatePrey(p, deltaTime, state.lion, state.prey));

  // Spawn new prey entities if needed
  if (state.time % DEFAULT_PREY_SPAWN_CONFIG.spawnInterval < deltaTime) {
    updatedPrey = spawnPrey(DEFAULT_PREY_SPAWN_CONFIG, updatedPrey);
  }

  return updatedPrey;
}

/**
 * Updates a single prey's state
 */
function updatePrey(prey: PreyState, deltaTime: number, lion: LionState, allPrey: PreyState[]): PreyState {
  const secondsDelta = deltaTime / 1000;
  const currentTime = Date.now();

  // Update prey state using the new prey-behavior module
  const updatedPrey = updatePreyState(prey, deltaTime);

  // Check for threats and update fleeing behavior using the new threat-detection module
  const nearbyFleeingPrey = detectNearbyFleeingPrey(updatedPrey, allPrey);
  const distanceToLion = getDistance(updatedPrey.position, lion.position);
  const shouldStartFleeingFromLion =
    checkShouldStartFleeing(updatedPrey, lion, distanceToLion) &&
    (prey.state !== 'fleeing' || prey.fleeingSource?.type !== 'lion');

  // Prioritize threats: lion is more important than fleeing prey
  if (shouldStartFleeingFromLion) {
    // Lion is visible - prioritize fleeing from lion
    startFleeing(
      updatedPrey,
      {
        type: 'lion',
        id: 'lion',
        position: lion.position,
      },
      currentTime,
    );
  } else if (nearbyFleeingPrey && (!updatedPrey.fleeingSource || updatedPrey.fleeingSource.type !== 'lion')) {
    // No lion visible but detected fleeing prey
    startFleeing(
      updatedPrey,
      {
        type: 'prey',
        id: nearbyFleeingPrey.id,
        position: nearbyFleeingPrey.position,
      },
      currentTime,
    );
  }

  // Update position if fleeing
  if (updatedPrey.state === 'fleeing') {
    updatePosition(updatedPrey, secondsDelta);
  }

  // Add debug information for dev mode
  if (devConfig.debugFleeingState) {
    updatedPrey.safeDistanceReached = updatedPrey.fleeingSource
      ? getDistance(updatedPrey.position, updatedPrey.fleeingSource.position) > FLEE_DISTANCE
      : true;
  }

  return updatedPrey;
}

/**
 * Updates prey position and handles world boundaries
 */
function updatePosition(prey: PreyState, secondsDelta: number): void {
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
