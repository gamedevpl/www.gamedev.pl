import { GAME_WORLD_WIDTH } from '../../../game-world/game-world-consts';
import { GameWorldState } from '../../../game-world/game-world-types';
import { SnowGround, SNOW_GROUND, SnowGroundState } from './snow-ground-types';

/**
 * Get parallax factor for a specific layer with slight randomization
 */
function getParallaxFactor(layer: number): number {
  // Get base parallax factor for the layer
  const baseParallax =
    layer === 0 ? SNOW_GROUND.PARALLAX.DISTANT : layer === 1 ? SNOW_GROUND.PARALLAX.MIDDLE : SNOW_GROUND.PARALLAX.NEAR;

  // Add random variation within the specified range
  const variation = (Math.random() * 2 - 1) * SNOW_GROUND.PARALLAX.VARIATION;
  return Math.max(0, Math.min(1, baseParallax + variation));
}

/**
 * Get number of snow ground pieces for a specific layer
 */
function getGroundDensityForLayer(layer: number): number {
  return layer === 0
    ? SNOW_GROUND.DENSITY.DISTANT
    : layer === 1
    ? SNOW_GROUND.DENSITY.MIDDLE
    : SNOW_GROUND.DENSITY.NEAR;
}

/**
 * Generate snow ground pieces for a specific layer
 */
function generateGrounds(layer: number): SnowGround[] {
  const grounds: SnowGround[] = [];
  const count = getGroundDensityForLayer(layer);
  const baseSpacing = GAME_WORLD_WIDTH / count;

  for (let i = 0; i < count; i++) {
    // Calculate width with random variation
    const width = SNOW_GROUND.MIN_WIDTH + Math.random() * (SNOW_GROUND.MAX_WIDTH - SNOW_GROUND.MIN_WIDTH);

    // Calculate position with spacing variation
    const baseX = (i * GAME_WORLD_WIDTH) / count;
    const spacingVariation = baseSpacing * SNOW_GROUND.SPACING_VARIATION;
    const x = baseX + (Math.random() - 0.5) * spacingVariation;

    grounds.push({
      x,
      width,
      layer,
      parallaxFactor: getParallaxFactor(layer),
    });
  }

  return grounds;
}

/**
 * Create initial snow ground state
 */
export function createSnowGroundState(): SnowGroundState {
  const grounds: SnowGround[] = [];

  // Generate snow ground pieces for each layer
  for (let layer = 0; layer < SNOW_GROUND.LAYERS; layer++) {
    grounds.push(...generateGrounds(layer));
  }

  return { grounds };
}

/**
 * Update snow ground state
 * Currently snow grounds are static, but this function is included for consistency
 * and potential future animations
 */
export function updateSnowGroundState(_world: GameWorldState, state: SnowGroundState): SnowGroundState {
  return state;
}
