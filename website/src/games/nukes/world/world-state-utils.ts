import { WorldState, StateId, City } from './world-state-types';

export function getCityPopulation(worldState: WorldState, cityId: string): number {
  const city = worldState.cities.find((city) => city.id === cityId);
  if (!city) {
    return 0;
  }

  const explosions = worldState.explosions.filter(
    (explosion) =>
      explosion.startTimestamp <= worldState.timestamp &&
      explosion.endTimestamp > worldState.timestamp &&
      Math.hypot(explosion.position.x - city.position.x, explosion.position.y - city.position.y) <= explosion.radius,
  );

  let population = city.population;
  for (const explosion of explosions) {
    const distance = Math.hypot(explosion.position.x - city.position.x, explosion.position.y - city.position.y);
    const casualtyPercentage = 1 - distance / explosion.radius;
    population *= 1 - casualtyPercentage;
  }

  return Math.floor(population);
}

export function getStateCityPopulations(worldState: WorldState, stateId: StateId): Array<[City, number]> {
  return worldState.cities
    .filter((city) => city.stateId === stateId)
    .map((city) => [city, getCityPopulation(worldState, city.id)]);
}

export function calculateAllStatePopulations(worldState: WorldState): Record<StateId, number> {
  return Object.fromEntries(
    worldState.states.map((state) => [
      state.id,
      getStateCityPopulations(worldState, state.id).reduce((sum, [, population]) => sum + population, 0),
    ]),
  );
}

export function getStatePopulation(worldState: WorldState, stateId: StateId): number {
  return getStateCityPopulations(worldState, stateId).reduce((sum, [, population]) => sum + population, 0);
}

export function getClosestCity(worldState: WorldState, position: { x: number; y: number }): City | undefined {
  return worldState.cities.reduce((closest: City | undefined, city: City) => {
    const distance = Math.hypot(city.position.x - position.x, city.position.y - position.y);
    if (!closest || distance < Math.hypot(closest.position.x - position.x, closest.position.y - position.y)) {
      return city;
    }
    return closest;
  }, undefined);
}
