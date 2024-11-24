import { GameWorldState } from '../game-world/game-world-types';
import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from '../game-world/game-world-consts';
import { MOUNTAINS, TREES, STARS, Mountain, Tree, Star } from './landscape-render-types';

// Complete landscape state type
export type LandscapeState = {
  mountains: Mountain[];
  trees: Tree[];
  stars: Star[];
  time: number; // For animations (e.g., star twinkling)
};

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
 * Generate trees for a specific layer
 */
function generateTrees(layer: number): Tree[] {
  const trees: Tree[] = [];
  const count = Object.values(TREES.DENSITY)[layer];

  for (let i = 0; i < count; i++) {
    const height = TREES.MIN_HEIGHT + Math.random() * (TREES.MAX_HEIGHT - TREES.MIN_HEIGHT);
    const width = height * TREES.WIDTH_RATIO;
    const x = (i * GAME_WORLD_WIDTH) / count + ((Math.random() - 0.5) * GAME_WORLD_WIDTH) / count;

    trees.push({
      x,
      height,
      width,
      layer,
    });
  }

  return trees;
}

/**
 * Generate stars for the night sky
 */
function generateStars(): Star[] {
  const stars: Star[] = [];

  for (let i = 0; i < STARS.COUNT; i++) {
    stars.push({
      x: Math.random() * GAME_WORLD_WIDTH,
      y: Math.random() * GAME_WORLD_HEIGHT * 0.7, // Stars only in upper 70% of sky
      size: STARS.MIN_SIZE + Math.random() * (STARS.MAX_SIZE - STARS.MIN_SIZE),
      twinkle: Math.random(), // Random initial phase
    });
  }

  return stars;
}

/**
 * Create initial landscape state
 */
export function createLandscapeState(): LandscapeState {
  const mountains: Mountain[] = [];
  const trees: Tree[] = [];

  // Generate mountains for each layer
  for (let layer = 0; layer < MOUNTAINS.LAYERS; layer++) {
    mountains.push(...generateMountains(layer));
  }

  // Generate trees for each layer
  for (let layer = 0; layer < TREES.LAYERS; layer++) {
    trees.push(...generateTrees(layer));
  }

  return {
    mountains,
    trees,
    stars: generateStars(),
    time: 0,
  };
}

/**
 * Update landscape state
 */
export function updateLandscapeState(_world: GameWorldState, state: LandscapeState, deltaTime: number): LandscapeState {
  // Update time
  const time = state.time + deltaTime;

  // Update star twinkle phases
  const stars = state.stars.map((star) => ({
    ...star,
    twinkle: (star.twinkle + STARS.TWINKLE_SPEED * deltaTime) % 1,
  }));

  return {
    ...state,
    time,
    stars,
  };
}
