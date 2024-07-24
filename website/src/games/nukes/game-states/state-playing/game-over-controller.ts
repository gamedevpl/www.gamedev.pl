import { useEffect } from 'react';
import { StateId, Strategy, WorldState } from '../../world/world-state-types';
import { GAME_OVER_TIMEOUT } from '../../world/world-state-constants';

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
    const statePopulations = Object.fromEntries(
      worldState.states.map((state) => [
        state.id,
        worldState.cities
          .filter((city) => city.stateId === state.id)
          .reduce((sum, city) => sum + city.populationHistogram[city.populationHistogram.length - 1].population, 0),
      ]),
    );

    const numStatesWithPopulation = Object.values(statePopulations).filter((population) => population > 0).length;
    const areAllLaunchSitesDestroyed = worldState.launchSites.length === 0;

    const currentTime = worldState.timestamp;
    const hostileStates = worldState.states.filter(
      (state) =>
        // the state still exists
        statePopulations[state.id] > 0 &&
        // the state is hostile against someone
        Object.entries(state.strategies).filter(
          ([stateId, strategy]) => statePopulations[stateId] > 0 && strategy === Strategy.HOSTILE,
        ).length > 0,
    );
    const recentMissileLaunches = worldState.launchSites.some(
      (site) => site.lastLaunchTimestamp && currentTime - site.lastLaunchTimestamp < GAME_OVER_TIMEOUT,
    );

    if (
      // only one state survived, and it is the winner
      numStatesWithPopulation <= 1 ||
      // no state can attack anymore, and there is no winner
      areAllLaunchSitesDestroyed ||
      // there was no action and game timed out without winner
      (!hostileStates.length && !recentMissileLaunches && currentTime > GAME_OVER_TIMEOUT)
    ) {
      const winner =
        numStatesWithPopulation === 1
          ? worldState.states.find((state) => statePopulations[state.id] > 0)?.id
          : undefined;
      onGameOver({
        populations: Object.fromEntries(worldState.states.map((state) => [state.id, statePopulations[state.id]])),
        winner,
        stateNames: Object.fromEntries(worldState.states.map((state) => [state.id, state.name])),
        playerStateId: worldState.states.find((state) => state.isPlayerControlled)!.id,
      });
    }
  }, [worldState, onGameOver]);

  return null;
}
