import stringToColor from 'string-to-color';
import { getRandomCityNames } from '../content/city-names';
import { getRandomStateNames } from '../content/state-names';
import {
  City,
  EntityType,
  Explosion,
  LaunchSite,
  Missile,
  Sector,
  SectorType,
  State,
  Strategy,
  WorldState,
  Position,
} from './world-state-types';
import { EXPLOSION_RADIUS } from './world-state-constants';

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

  const fantasyStateNames = getRandomStateNames(numberOfStates * 2).filter((name) => name !== playerStateName);
  const citiesPerState = 5;
  const fantasyCityNames = getRandomCityNames(numberOfStates * citiesPerState * 2);

  const states: State[] = [];
  const cities: City[] = [];
  const launchSites: LaunchSite[] = [];
  const sectors: Sector[] = [];
  const MIN_DISTANCE = EXPLOSION_RADIUS * 3; // Minimum distance between entities

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

  // Function to get a random position within the world
  const getRandomPosition = (): Position => ({
    x: Math.floor(Math.random() * (worldWidth - 10) + 5) * sectorSize,
    y: Math.floor(Math.random() * (worldHeight - 10) + 5) * sectorSize,
  });

  // Function to check if a position is valid (not too close to other states)
  const isValidPosition = (pos: Position, statePositions: Position[]): boolean => {
    const minDistance = Math.floor(worldWidth / (Math.sqrt(numberOfStates) * 2)) * sectorSize;
    return statePositions.every(
      (statePos) => Math.abs(pos.x - statePos.x) > minDistance || Math.abs(pos.y - statePos.y) > minDistance,
    );
  };

  // Function to create ground around a position
  const createGround = (center: Position, radius: number) => {
    const centerX = Math.floor(center.x / sectorSize);
    const centerY = Math.floor(center.y / sectorSize);
    for (let y = centerY - radius; y <= centerY + radius; y++) {
      for (let x = centerX - radius; x <= centerX + radius; x++) {
        if (x >= 0 && x < worldWidth && y >= 0 && y < worldHeight) {
          const index = y * worldWidth + x;
          sectors[index].type = SectorType.GROUND;
          sectors[index].depth = undefined; // Remove depth for ground sectors
        }
      }
    }
  };

  // Function to check if a position is far enough from existing entities
  const isFarEnough = (pos: Position, entities: { position: Position }[]): boolean => {
    return entities.every(
      (entity) =>
        Math.sqrt(Math.pow(pos.x - entity.position.x, 2) + Math.pow(pos.y - entity.position.y, 2)) >= MIN_DISTANCE,
    );
  };

  const statePositions: Position[] = [];

  for (let i = 0; i < numberOfStates; i++) {
    const stateId = `state-${i + 1}`;
    const stateName = i === 0 ? playerStateName : fantasyStateNames.pop()!;

    const state: State = {
      id: stateId,
      name: stateName,
      color: stringToColor(stateName),
      isPlayerControlled: i === 0,
      strategies: {},
      generalStrategy:
        i === 0
          ? undefined
          : [Strategy.NEUTRAL, Strategy.HOSTILE, Strategy.FRIENDLY].sort(() => Math.random() - Math.random())[0],
    };

    // Set strategies for all other states
    states.forEach((otherState) => {
      state.strategies[otherState.id] = Strategy.NEUTRAL;
      otherState.strategies[stateId] = Strategy.NEUTRAL;
    });

    states.push(state);

    // Find a valid position for the state
    let statePosition: Position;
    let maxIterations = 10;
    do {
      statePosition = getRandomPosition();
      if (maxIterations-- <= 0) {
        break;
      }
    } while (!isValidPosition(statePosition, statePositions));
    statePositions.push(statePosition);

    // Create ground for the state
    createGround(statePosition, citiesPerState * citiesPerState);

    // Create cities for the state
    const stateEntities: { position: Position }[] = [];
    for (let j = 0; j < citiesPerState; j++) {
      const cityId = `city-${cities.length + 1}`;
      let cityPosition: Position;
      let maxIterations = 10;
      do {
        cityPosition = {
          x: statePosition.x + (Math.random() - 0.5) * 30 * sectorSize,
          y: statePosition.y + (Math.random() - 0.5) * 30 * sectorSize,
        };
        if (maxIterations-- <= 0) {
          break;
        }
      } while (!isFarEnough(cityPosition, stateEntities));
      stateEntities.push({ position: cityPosition });
      cities.push({
        id: cityId,
        stateId,
        name: fantasyCityNames.pop()!,
        position: cityPosition,
        populationHistogram: [{ timestamp: 0, population: Math.floor(Math.random() * 3000) + 1000 }],
      });

      // Ensure ground around the city
      createGround(cityPosition, 2);
    }

    // Create launch sites for the state
    for (let j = 0; j < 4; j++) {
      const launchSiteId = `launch-site-${launchSites.length + 1}`;
      let launchSitePosition: Position;
      let maxIterations = 10;
      do {
        launchSitePosition = {
          x: statePosition.x + (Math.random() - 0.5) * 15 * sectorSize,
          y: statePosition.y + (Math.random() - 0.5) * 15 * sectorSize,
        };
        if (maxIterations-- <= 0) {
          break;
        }
      } while (!isFarEnough(launchSitePosition, stateEntities));
      stateEntities.push({ position: launchSitePosition });

      launchSites.push({
        type: EntityType.LAUNCH_SITE,
        id: launchSiteId,
        stateId,
        position: launchSitePosition,
      });

      // Ensure ground around the launch site
      createGround(launchSitePosition, 1);
    }
  }

  // Calculate water depth and ground height
  const calculateWaterDepthAndGroundHeight = () => {
    const queue: [number, number, number][] = [];
    const visited: boolean[][] = Array(worldHeight)
      .fill(null)
      .map(() => Array(worldWidth).fill(false));

    // Find all water sectors adjacent to ground and add them to the queue
    for (let y = 0; y < worldHeight; y++) {
      for (let x = 0; x < worldWidth; x++) {
        const index = y * worldWidth + x;
        if (sectors[index].type === SectorType.WATER) {
          const adjacentToGround = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ].some(([dx, dy]) => {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < worldWidth && ny >= 0 && ny < worldHeight) {
              const neighborIndex = ny * worldWidth + nx;
              return sectors[neighborIndex].type === SectorType.GROUND;
            }
            return false;
          });
          if (adjacentToGround) {
            queue.push([x, y, 0]);
            visited[y][x] = true;
          }
        }
      }
    }

    // BFS to calculate depth and height
    while (queue.length > 0) {
      const [x, y, distance] = queue.shift()!;
      const index = y * worldWidth + x;

      if (sectors[index].type === SectorType.WATER) {
        sectors[index].depth = distance + (Math.random() - Math.random()) / 5;
      } else if (sectors[index].type === SectorType.GROUND) {
        sectors[index].height = Math.sqrt(distance) + (Math.random() - Math.random()) / 10;
      }

      const directions = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];
      for (const [dx, dy] of directions) {
        const newX = x + dx;
        const newY = y + dy;
        if (newX >= 0 && newX < worldWidth && newY >= 0 && newY < worldHeight && !visited[newY][newX]) {
          queue.push([newX, newY, distance + 1]);
          visited[newY][newX] = true;
        }
      }
    }
  };

  calculateWaterDepthAndGroundHeight();

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
