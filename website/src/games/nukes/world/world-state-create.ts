import { Explosion, Missile, Sector, SectorType, WorldState } from './world-state-types';
import { calculateWaterDepthAndGroundHeight } from './create-world/sector-generation';
import { generateStates } from './create-world/state-generation';
import { SECTOR_SIZE } from './world-state-constants';

export function createWorldState({
  playerStateName,
  numberOfStates = 3,
}: {
  playerStateName: string;
  numberOfStates: number;
}): WorldState {
  const worldWidth = Math.max(200, Math.ceil(Math.sqrt(numberOfStates) * 10));
  const worldHeight = worldWidth;

  const sectors: Sector[] = [];

  // Initialize the world with water
  for (let y = 0; y < worldHeight; y++) {
    for (let x = 0; x < worldWidth; x++) {
      sectors.push({
        id: `sector-${sectors.length + 1}`,
        position: { x: x * SECTOR_SIZE, y: y * SECTOR_SIZE },
        rect: {
          left: x * SECTOR_SIZE,
          top: y * SECTOR_SIZE,
          right: (x + 1) * SECTOR_SIZE,
          bottom: (y + 1) * SECTOR_SIZE,
        },
        type: SectorType.WATER,
        depth: 0, // Initialize depth to 0
        height: 0, // Initialize height to 0 for water sectors
      });
    }
  }

  const { states, cities, launchSites } = generateStates(
    numberOfStates,
    playerStateName,
    worldWidth,
    worldHeight,
    sectors,
  );

  // Calculate water depth and ground height
  calculateWaterDepthAndGroundHeight(sectors, worldWidth, worldHeight);

  const missiles: Missile[] = [];
  const explosions: Explosion[] = [];

  return {
    timestamp: 0,
    states,
    cities,
    launchSites,
    sectors,
    missiles,
    explosions,
  };
}
