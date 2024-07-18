import { useEffect } from 'react';
import { StateId, WorldState } from '../../world/world-state-types';

// A type for game result
export type GameResult = {
  populations: Record<StateId, number>;
  winner: StateId | undefined;
  stateNames: Record<StateId, string>;
  playerStateId: StateId;
};

// A component which controls whether the game should end
export function GameOverController({
  worldState,
  onGameOver,
}: {
  worldState: WorldState;
  onGameOver: (result: GameResult) => void;
}) {
  useEffect(() => {
    const statePopulations = worldState.states.map((state) =>
      worldState.cities
        .filter((city) => city.stateId === state.id)
        .reduce((sum, city) => sum + city.populationHistogram[city.populationHistogram.length - 1].population, 0),
    );

    const numStatesWithPopulation = statePopulations.filter((population) => population > 0).length;
    const areAllLaunchSitesDestroyed = worldState.launchSites.length === 0;

    if (numStatesWithPopulation <= 1 || areAllLaunchSitesDestroyed) {
      const winner = worldState.states.find((state) => statePopulations[worldState.states.indexOf(state)] > 0)?.id;
      onGameOver({
        populations: Object.fromEntries(worldState.states.map((state, index) => [state.id, statePopulations[index]])),
        winner,
        stateNames: Object.fromEntries(worldState.states.map((state) => [state.id, state.name])),
        playerStateId: worldState.states.find((state) => state.isPlayerControlled)!.id,
      });
    }
  }, [worldState]);

  return null;
}
