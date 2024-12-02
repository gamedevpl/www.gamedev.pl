import { GAME_WORLD_WIDTH } from '../../../game-world/game-world-consts';
import { GameWorldState } from '../../../game-world/game-world-types';
import { SnowGround, SNOW_GROUND, SnowGroundState } from './snow-ground-types';

/**
 * Generate snow ground pieces with uniform distribution
 */
function generateGrounds(): SnowGround[] {
  const grounds: SnowGround[] = [];
  const baseSpacing = GAME_WORLD_WIDTH / SNOW_GROUND.DENSITY;

  for (let i = 0; i < SNOW_GROUND.DENSITY; i++) {
    // Calculate width with random variation
    const width = SNOW_GROUND.MIN_WIDTH + Math.random() * (SNOW_GROUND.MAX_WIDTH - SNOW_GROUND.MIN_WIDTH);

    // Calculate position with spacing variation
    const baseX = (i * GAME_WORLD_WIDTH) / SNOW_GROUND.DENSITY;
    const spacingVariation = baseSpacing * SNOW_GROUND.SPACING_VARIATION;
    const x = baseX + (Math.random() - 0.5) * spacingVariation;

    grounds.push({
      x,
      width,
    });
  }

  return grounds;
}

/**
 * Create initial snow ground state
 */
export function createSnowGroundState(): SnowGroundState {
  return {
    grounds: generateGrounds(),
  };
}

/**
 * Update snow ground state
 * Snow grounds are static, but this function is included for consistency
 * and potential future animations
 */
export function updateSnowGroundState(_world: GameWorldState, state: SnowGroundState): SnowGroundState {
  return state;
}
