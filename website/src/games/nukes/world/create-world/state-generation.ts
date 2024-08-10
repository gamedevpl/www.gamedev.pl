import stringToColor from 'string-to-color';
import { getRandomCityNames } from '../../content/city-names';
import { getRandomStateNames } from '../../content/state-names';
import { City, EntityType, LaunchSite, State, Strategy, Position, Sector } from '../world-state-types';
import { EXPLOSION_RADIUS } from '../world-state-constants';
import { createGround } from './ground-generation';
import { getRandomPosition, isValidPosition, isFarEnough } from './utils';

export function generateStates(
  numberOfStates: number,
  playerStateName: string,
  worldWidth: number,
  worldHeight: number,
  sectorSize: number,
  sectors: Sector[],
) {
  const states: State[] = [];
  const cities: City[] = [];
  const launchSites: LaunchSite[] = [];
  const MIN_DISTANCE = EXPLOSION_RADIUS * 3;

  const fantasyStateNames = getRandomStateNames(numberOfStates * 2).filter((name) => name !== playerStateName);
  const citiesPerState = 5;
  const fantasyCityNames = getRandomCityNames(numberOfStates * citiesPerState * 2);

  const statePositions: Position[] = [];

  for (let i = 0; i < numberOfStates; i++) {
    const stateId = `state-${i + 1}`;
    const stateName = i === 0 ? playerStateName : fantasyStateNames.pop()!;

    const state = createState(stateId, stateName, i === 0);
    states.push(state);

    // Set strategies for all other states
    states.forEach((otherState) => {
      state.strategies[otherState.id] = Strategy.NEUTRAL;
      otherState.strategies[stateId] = Strategy.NEUTRAL;
    });

    const statePosition = findStatePosition(statePositions, worldWidth, worldHeight, sectorSize);
    statePositions.push(statePosition);

    // Create ground for the state
    createGround(statePosition, worldWidth / 2, sectors, worldWidth, worldHeight, sectorSize);

    // Create cities and launch sites for the state
    createCitiesAndLaunchSites(
      stateId,
      statePosition,
      citiesPerState,
      fantasyCityNames,
      cities,
      launchSites,
      MIN_DISTANCE,
      sectorSize,
      sectors,
      worldWidth,
      worldHeight,
    );

    // Calculate the population of the state
    state.population = cities
      .filter((city) => city.stateId === stateId)
      .reduce((total, city) => total + city.population, 0);
  }

  return { states, cities, launchSites };
}

function createState(stateId: string, stateName: string, isPlayerControlled: boolean): State {
  return {
    id: stateId,
    name: stateName,
    color: stringToColor(stateName),
    isPlayerControlled,
    strategies: {},
    generalStrategy: isPlayerControlled
      ? undefined
      : [Strategy.NEUTRAL, Strategy.HOSTILE, Strategy.FRIENDLY].sort(() => Math.random() - 0.5)[0],
    population: 0, // Initialize population with 0
  };
}

function findStatePosition(
  statePositions: Position[],
  worldWidth: number,
  worldHeight: number,
  sectorSize: number,
): Position {
  let statePosition: Position;
  let maxIterations = 10;
  do {
    statePosition = getRandomPosition(worldWidth, worldHeight, sectorSize);
    if (maxIterations-- <= 0) {
      break;
    }
  } while (!isValidPosition(statePosition, statePositions, worldWidth, worldHeight));
  return statePosition;
}

function createCitiesAndLaunchSites(
  stateId: string,
  statePosition: Position,
  citiesPerState: number,
  fantasyCityNames: string[],
  cities: City[],
  launchSites: LaunchSite[],
  MIN_DISTANCE: number,
  sectorSize: number,
  sectors: Sector[],
  worldWidth: number,
  worldHeight: number,
) {
  const stateEntities: { position: Position }[] = [];

  // Create cities
  for (let j = 0; j < citiesPerState; j++) {
    const cityPosition = findEntityPosition(statePosition, stateEntities, MIN_DISTANCE, 30 * sectorSize);
    stateEntities.push({ position: cityPosition });

    cities.push({
      id: `city-${cities.length + 1}`,
      stateId,
      name: fantasyCityNames.pop()!,
      position: cityPosition,
      population: Math.floor(Math.random() * 3000) + 1000,
    });

    // Ensure ground around the city
    createGround(cityPosition, 2, sectors, worldWidth, worldHeight, sectorSize);
  }

  // Assign sectors to cities and calculate their initial populations
  for (const city of cities) {
    const citySectors = sectors.filter((sector) => {
      const dx = sector.position.x - city.position.x;
      const dy = sector.position.y - city.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance < worldWidth / 4; // Assign sectors within a certain range
    });

    for (const sector of citySectors) {
      sector.cityId = city.id;
      const dx = sector.position.x - city.position.x;
      const dy = sector.position.y - city.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      sector.population = Math.max(0, EXPLOSION_RADIUS - distance); // Population decreases with distance
    }

    city.population = citySectors.reduce((sum, sector) => sum + sector.population!, 0);
  }

  // Create launch sites
  for (let j = 0; j < 4; j++) {
    const launchSitePosition = findEntityPosition(statePosition, stateEntities, MIN_DISTANCE, 15 * sectorSize);
    stateEntities.push({ position: launchSitePosition });

    launchSites.push({
      type: EntityType.LAUNCH_SITE,
      id: `launch-site-${launchSites.length + 1}`,
      stateId,
      position: launchSitePosition,
    });

    // Ensure ground around the launch site
    createGround(launchSitePosition, 1, sectors, worldWidth, worldHeight, sectorSize);
  }

  return stateEntities;
}

function findEntityPosition(
  statePosition: Position,
  stateEntities: { position: Position }[],
  MIN_DISTANCE: number,
  range: number,
): Position {
  let entityPosition: Position;
  let maxIterations = 10;
  do {
    entityPosition = {
      x: statePosition.x + (Math.random() - 0.5) * range,
      y: statePosition.y + (Math.random() - 0.5) * range,
    };
    if (maxIterations-- <= 0) {
      break;
    }
  } while (!isFarEnough(entityPosition, stateEntities, MIN_DISTANCE));
  return entityPosition;
}
