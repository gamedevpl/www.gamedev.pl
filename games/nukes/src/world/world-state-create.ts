import { distance } from '../math/position-utils';
import { SectorType, WorldState } from './world-state-types';

export function createWorldState(): WorldState {
  const result: WorldState = {
    timestamp: 0,
    states: [
      {
        id: 'test-state',
        name: 'Test',
      },
    ],
    cities: [],
    launchSites: [],
    missiles: [
      {
        id: 'test-missile',
        launch: { x: 100, y: 100 },
        launchTimestamp: 0,
        target: { x: 200, y: 200 },
        targetTimestamp: 10,
      },
    ],
    explosions: [
      {
        id: 'test-explosion',
        startTimestamp: 10,
        endTimestamp: 15,
        position: { x: 200, y: 200 },
        radius: 30,
      },
    ],
    sectors: generateSectors(128, 50),
  };

  return result;
}

function generateSectors(sectorCount: number, sectorSize: number) {
  const cols = Math.floor(Math.sqrt(sectorCount));
  const rows = Math.floor(sectorCount / cols);

  const centerColX = cols / 2;
  const centerRowY = rows / 2;

  return Array.from({ length: sectorCount }).map((v, i) => {
    const x = i % cols;
    const y = Math.floor(i / rows);

    return {
      id: 'test-sector-' + i,
      type: distance(x, y, centerColX, centerRowY) <= centerColX ? SectorType.GROUND : SectorType.WATER,
      rect: {
        left: x * sectorSize,
        top: y * sectorSize,
        right: x * sectorSize + sectorSize,
        bottom: y * sectorSize + sectorSize,
      },
    };
  });
}
