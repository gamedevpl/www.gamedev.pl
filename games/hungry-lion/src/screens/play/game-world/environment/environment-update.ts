import { Environment, isGrassSector } from './environment-types';
import { UpdateContext } from '../game-world-types';

// Constants for environment mechanics
const GRASS_REGENERATION_RATE = 0.1; // How much grass grows per second
const MAX_GRASS_DENSITY = 100; // Maximum grass density

/**
 * Updates grass density over time and handles sector state
 */
export function environmentUpdate(updateContext: UpdateContext): Environment {
  const environment = updateContext.gameState.environment;

  // Update each sector
  environment.sectors = environment.sectors.map((sector) => {
    if (isGrassSector(sector)) {
      // Regenerate grass over time
      return {
        ...sector,
        density: Math.min(MAX_GRASS_DENSITY, sector.density + GRASS_REGENERATION_RATE * updateContext.deltaTime),
      };
    }
    return sector;
  });

  return environment;
}

/**
 * Initialize the environment with grass and water sectors
 */
export function environmentInit(): Environment {
  return {
    sectors: [
      {
        rect: { x: 100, y: 100, width: 100, height: 100 },
        type: 'grass',
        density: 100,
      },
      {
        rect: { x: 1300, y: 1300, width: 100, height: 100 },
        type: 'grass',
        density: 100,
      },
      {
        rect: { x: 1300, y: 300, width: 100, height: 100 },
        type: 'water',
        depth: 0.3, // Shallow water that's safe to drink
      },
      {
        rect: { x: 100, y: 1300, width: 100, height: 100 },
        type: 'water',
        depth: 0.8, // Deep water that's dangerous
      },
    ],
  };
}
