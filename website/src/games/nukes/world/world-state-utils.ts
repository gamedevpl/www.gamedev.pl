import { WorldState, StateId, City } from './world-state-types';

export function getStateCityPopulations(worldState: WorldState, stateId: StateId): Array<[City, number]> {
  return worldState.cities.filter((city) => city.stateId === stateId).map((city) => [city, city.population]);
}

export function calculateAllStatePopulations(worldState: WorldState): Record<StateId, number> {
  return Object.fromEntries(worldState.states.map((state) => [state.id, state.population]));
}

export function getStatePopulation(worldState: WorldState, stateId: StateId): number {
  const state = worldState.states.find((state) => state.id === stateId);
  return state ? state.population : 0;
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

// Function to format population
export function formatPopulation(population: number): string {
  if (population >= 1000) {
    return `${(population / 1000).toFixed(1)}M`;
  } else {
    return `${population.toFixed(0)}K`;
  }
}
