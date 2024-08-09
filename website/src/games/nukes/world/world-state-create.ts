import { Explosion, Missile, Sector, SectorType, WorldState } from './world-state-types';
import { calculateWaterDepthAndGroundHeight } from './create-world/sector-generation';
import { generateStates } from './create-world/state-generation';

export function createWorldState({
  playerStateName,
  numberOfStates = 3,
}: {
  playerStateName: string;
  numberOfStates: number;
}): WorldState {
  const sectorSize = 16;
  const worldWidth = Math.max(200, Math.ceil(Math.sqrt(numberOfStates) * 10));
  const worldHeight = worldWidth;

  const sectors: Sector[] = [];

  // Initialize the world with water
  for (let y = 0; y < worldHeight; y++) {
    for (let x = 0; x < worldWidth; x++) {
      sectors.push({
        id: `sector-${sectors.length + 1}`,
        position: { x: x * sectorSize, y: y * sectorSize },
        rect: {
          left: x * sectorSize,
          top: y * sectorSize,
          right: (x + 1) * sectorSize,
          bottom: (y + 1) * sectorSize,
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
    sectorSize,
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
