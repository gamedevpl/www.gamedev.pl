import { WorldState, State, City, CityId } from '../world-state-types';

export function updateCityAndStatePopulations(state: WorldState): WorldState {
  // Recalculate city populations based on their sectors
  const cityPopulations = state.sectors.reduce(
    (r, sector) => {
      if (!sector.cityId) {
        return r;
      }

      r[sector.cityId] = r[sector.cityId] ? r[sector.cityId] + (sector.population ?? 0) : (sector.population ?? 0);
      return r;
    },
    {} as Record<CityId, number>,
  );

  // Calculate and set population for each state
  for (const city of state.cities) {
    city.population = cityPopulations[city.id];
  }

  state.states = state.states.map((s: State) => {
    const statePopulation = state.cities
      .filter((city) => city.stateId === s.id)
      .reduce((sum: number, city: City) => sum + city.population, 0);
    return { ...s, population: statePopulation };
  });

  return state;
}
