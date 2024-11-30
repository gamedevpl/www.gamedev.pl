import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from '../../../game-world/game-world-consts';
import { GameWorldState } from '../../../game-world/game-world-types';
import { Star, STARS, StarState } from './star-types';

/**
 * Generate stars for the night sky
 */
function generateStars(): Star[] {
  const stars: Star[] = [];

  for (let i = 0; i < STARS.COUNT; i++) {
    stars.push({
      x: Math.random() * GAME_WORLD_WIDTH,
      y: Math.random() * GAME_WORLD_HEIGHT * STARS.SKY_HEIGHT_RATIO, // Stars only in upper part of sky
      size: STARS.MIN_SIZE + Math.random() * (STARS.MAX_SIZE - STARS.MIN_SIZE),
      twinkle: Math.random(), // Random initial phase
    });
  }

  return stars;
}

/**
 * Create initial star state
 */
export function createStarState(): StarState {
  return {
    stars: generateStars(),
    time: 0,
  };
}

/**
 * Update star state
 * Updates twinkle animation phases for all stars
 */
export function updateStarState(_world: GameWorldState, state: StarState, deltaTime: number): StarState {
  // Update time
  const time = state.time + deltaTime;

  // Update star twinkle phases
  const stars = state.stars.map((star) => ({
    ...star,
    twinkle: (star.twinkle + STARS.TWINKLE_SPEED * deltaTime) % 1,
  }));

  return {
    stars,
    time,
  };
}
