import { distance } from '../math/position-utils';
import { EntityType, SectorType, WorldState } from './world-state-types';

export function createWorldState(): WorldState {
  const result: WorldState = {
    timestamp: 0,
    states: [
      {
        id: 'test-state',
        name: 'TestState',
      },
    ],
    cities: [
      {
        id: 'test-city',
        name: 'TestCity',
        stateId: 'test-state',
        position: { x: 100, y: 100 },
      },
      {
        id: 'test-city2',
        name: 'TestCity2',
        stateId: 'test-state',
        position: { x: 150, y: 100 },
      },
      {
        id: 'test-city3',
        name: 'TestCity3',
        stateId: 'test-state',
        position: { x: 150, y: 50 },
      },
    ],
    launchSites: [
      {
        type: EntityType.LAUNCH_SITE,
        id: 'test-launch-site-1',
        stateId: 'test-state',
        position: { x: 100, y: 100 },
      },
      {
        type: EntityType.LAUNCH_SITE,
        id: 'test-launch-site-2',
        stateId: 'test-state',
        position: { x: 200, y: 200 },
      },
    ],
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
    sectors: generateSectors(32, 32, 16),
  };

  return result;
}

function generateSectors(cols: number, rows: number, sectorSize: number) {
  const centerColX = cols / 2;
  const centerRowY = rows / 2;

  return Array.from({ length: cols * rows }).map((_v, i) => {
    const x = i % cols;
    const y = Math.floor(i / rows);

    return {
      id: 'test-sector-' + i,
      type: distance(x, y, centerColX, centerRowY) <= centerColX / 2 ? SectorType.GROUND : SectorType.WATER,
      rect: {
        left: x * sectorSize,
        top: y * sectorSize,
        right: x * sectorSize + sectorSize,
        bottom: y * sectorSize + sectorSize,
      },
    };
  });
}
