import {
  City,
  EntityType,
  Explosion,
  LaunchSite,
  Missile,
  Sector,
  SectorType,
  State,
  WorldState,
} from './world-state-types';

export function createWorldState({ playerStateName }: { playerStateName: string }): WorldState {
  const sectorSize = 16;
  const worldWidth = 50;
  const worldHeight = 50;

  const states: State[] = [
    { id: 'state-1', name: playerStateName, isPlayerControlled: true },
    { id: 'state-2', name: 'State 2', isPlayerControlled: false },
    { id: 'state-3', name: 'State 3', isPlayerControlled: false },
  ];

  const cities: City[] = [
    {
      id: 'city-1',
      stateId: 'state-1',
      name: 'City 1A',
      position: { x: 10 * sectorSize, y: 10 * sectorSize },
      populationHistogram: [{ timestamp: 0, population: 1000 }],
    },
    {
      id: 'city-2',
      stateId: 'state-1',
      name: 'City 1B',
      position: { x: 13 * sectorSize, y: 13 * sectorSize },
      populationHistogram: [{ timestamp: 0, population: 1500 }],
    },
    {
      id: 'city-3',
      stateId: 'state-2',
      name: 'City 2A',
      position: { x: 30 * sectorSize, y: 10 * sectorSize },
      populationHistogram: [{ timestamp: 0, population: 2000 }],
    },
    {
      id: 'city-4',
      stateId: 'state-2',
      name: 'City 2B',
      position: { x: 33 * sectorSize, y: 13 * sectorSize },
      populationHistogram: [{ timestamp: 0, population: 2500 }],
    },
    {
      id: 'city-5',
      stateId: 'state-3',
      name: 'City 3A',
      position: { x: 10 * sectorSize, y: 30 * sectorSize },
      populationHistogram: [{ timestamp: 0, population: 3000 }],
    },
    {
      id: 'city-6',
      stateId: 'state-3',
      name: 'City 3B',
      position: { x: 13 * sectorSize, y: 33 * sectorSize },
      populationHistogram: [{ timestamp: 0, population: 3500 }],
    },
  ];

  const launchSites: LaunchSite[] = [
    {
      type: EntityType.LAUNCH_SITE,
      id: 'launch-site-1',
      stateId: 'state-1',
      position: { x: 8 * sectorSize, y: 15 * sectorSize },
    },
    {
      type: EntityType.LAUNCH_SITE,
      id: 'launch-site-2',
      stateId: 'state-1',
      position: { x: 15 * sectorSize, y: 8 * sectorSize },
    },
    {
      type: EntityType.LAUNCH_SITE,
      id: 'launch-site-3',
      stateId: 'state-2',
      position: { x: 28 * sectorSize, y: 15 * sectorSize },
    },
    {
      type: EntityType.LAUNCH_SITE,
      id: 'launch-site-4',
      stateId: 'state-2',
      position: { x: 35 * sectorSize, y: 8 * sectorSize },
    },
    {
      type: EntityType.LAUNCH_SITE,
      id: 'launch-site-5',
      stateId: 'state-3',
      position: { x: 8 * sectorSize, y: 35 * sectorSize },
    },
    {
      type: EntityType.LAUNCH_SITE,
      id: 'launch-site-6',
      stateId: 'state-3',
      position: { x: 15 * sectorSize, y: 28 * sectorSize },
    },
  ];

  const sectors: Sector[] = [];
  let sectorIdCounter = 1;

  for (let y = 0; y < worldHeight; y++) {
    for (let x = 0; x < worldWidth; x++) {
      const isGround =
        (y >= 8 && y <= 17 && x >= 7 && x <= 18) ||
        (y >= 7 && y <= 18 && x >= 27 && x <= 38) ||
        (y >= 27 && y <= 38 && x >= 7 && x <= 18);

      sectors.push({
        id: `sector-${sectorIdCounter++}`,
        position: { x: x * sectorSize, y: y * sectorSize },
        rect: {
          left: x * sectorSize,
          top: y * sectorSize,
          right: (x + 1) * sectorSize,
          bottom: (y + 1) * sectorSize,
        },
        type: isGround ? SectorType.GROUND : SectorType.WATER,
      });
    }
  }

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
