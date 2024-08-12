import { WorldState, StateId, City, State, Sector, Position } from './world-state-types';

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

// Optimized function to find border sectors
export function findBorderSectors(sectors: Sector[], state: State): Sector[] {
  const borderSectors: Set<Sector> = new Set();
  const sectorMap: Map<string, Sector> = new Map();

  // Create a map of sector positions for quick lookup
  sectors.forEach((sector) => {
    sectorMap.set(`${sector.position.x},${sector.position.y}`, sector);
  });

  // Helper function to check if a sector is a border
  const checkAndAddBorderSector = (sector: Sector, adjacentPos: Position) => {
    const adjacentSector = sectorMap.get(`${adjacentPos.x},${adjacentPos.y}`);
    if (adjacentSector && adjacentSector.stateId !== state.id) {
      borderSectors.add(sector);
    }
  };

  // Single pass through all sectors
  sectors.forEach((sector) => {
    if (sector.stateId === state.id) {
      // Check four adjacent positions
      const adjacentPositions = [
        { x: sector.position.x, y: sector.position.y - 1 }, // up
        { x: sector.position.x, y: sector.position.y + 1 }, // down
        { x: sector.position.x - 1, y: sector.position.y }, // left
        { x: sector.position.x + 1, y: sector.position.y }, // right
      ];

      adjacentPositions.forEach((pos) => checkAndAddBorderSector(sector, pos));
    }
  });

  return Array.from(borderSectors);
}
