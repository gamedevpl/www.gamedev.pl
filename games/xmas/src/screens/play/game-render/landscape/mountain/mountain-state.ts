import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from '../../../game-world/game-world-consts';
import { GameWorldState } from '../../../game-world/game-world-types';
import { Mountain, MOUNTAINS, MountainState } from './mountain-types';

/**
 * Generate mountain points using a simplified diamond-square algorithm
 */
function generateMountainPoints(
  x: number,
  width: number,
  height: number,
  jaggedness: number,
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const segments = 8; // Number of segments per mountain

  // Start with the base points
  points.push({ x, y: GAME_WORLD_HEIGHT });

  // Generate middle points with random height variations
  for (let i = 1; i <= segments; i++) {
    const px = x + (width * i) / segments;
    const normalizedHeight = Math.sin((Math.PI * i) / segments); // Basic mountain shape
    const randomVariation = (Math.random() - 0.5) * 2 * jaggedness * height;
    const py = GAME_WORLD_HEIGHT - (height * normalizedHeight + randomVariation);
    points.push({ x: px, y: py });
  }

  // Add the final base point
  points.push({ x: x + width, y: GAME_WORLD_HEIGHT });

  return points;
}

/**
 * Generate mountains for a specific layer
 */
function generateMountains(layer: number): Mountain[] {
  const mountains: Mountain[] = [];
  const peaks = Object.values(MOUNTAINS.PEAKS)[layer];
  const baseWidth = GAME_WORLD_WIDTH / peaks;

  for (let i = 0; i < peaks; i++) {
    const width = baseWidth * (0.8 + Math.random() * 0.4); // Vary width slightly
    const height = MOUNTAINS.MIN_HEIGHT + Math.random() * (MOUNTAINS.MAX_HEIGHT - MOUNTAINS.MIN_HEIGHT);
    const x = (i * GAME_WORLD_WIDTH) / peaks + (Math.random() - 0.5) * baseWidth * 0.2;

    mountains.push({
      x,
      width,
      height,
      layer,
      points: generateMountainPoints(x, width, height, MOUNTAINS.JAGGEDNESS),
    });
  }

  return mountains;
}

/**
 * Create initial mountain state
 */
export function createMountainState(): MountainState {
  const mountains: Mountain[] = [];

  // Generate mountains for each layer
  for (let layer = 0; layer < MOUNTAINS.LAYERS; layer++) {
    mountains.push(...generateMountains(layer));
  }

  return { mountains };
}

/**
 * Update mountain state
 * Currently mountains are static, but this function is included for consistency
 * and potential future animations
 */
export function updateMountainState(_world: GameWorldState, state: MountainState): MountainState {
  return state;
}
