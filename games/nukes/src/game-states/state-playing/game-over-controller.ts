import { useEffect, useState } from 'react';
import { StateId, Strategy, WorldState } from '../../world/world-state-types';
import { GAME_OVER_TIMEOUT } from '../../world/world-state-constants';
import { dispatchMessage } from '../../messaging/messages';
import { calculateAllStatePopulations } from '../../world/world-state-utils';

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
  const [gameOverTimestamp, setGameOverTimestamp] = useState<number | null>(null);
  const [isGameOver, setGameOver] = useState(false);

  useEffect(() => {
    if (isGameOver) {
      return;
    }

    const statePopulations = calculateAllStatePopulations(worldState);

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

    const timeLeft = GAME_OVER_TIMEOUT - currentTime;
    if (!hostileStates.length && !recentMissileLaunches && timeLeft > 0 && timeLeft <= 10) {
      if (!gameOverTimestamp) {
        setGameOverTimestamp(currentTime);
      } else {
        dispatchMessage(
          `Game will end in ${Math.ceil(timeLeft)} seconds if no action is taken!`,
          gameOverTimestamp,
          gameOverTimestamp + 10,
          'gameOverCountdown',
          undefined,
          false,
          true,
        );
      }
    }

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

      setGameOver(true);

      dispatchMessage(
        ['Game Over!', 'Results will be shown shortly...'],
        currentTime,
        currentTime + 5,
        'gameOverCountdown',
        undefined,
        false,
        true,
      );

      setTimeout(() => {
        onGameOver({
          populations: statePopulations,
          winner,
          stateNames: Object.fromEntries(worldState.states.map((state) => [state.id, state.name])),
          playerStateId: worldState.states.find((state) => state.isPlayerControlled)!.id,
        });
      }, 5000); // 5 seconds delay
    }
  }, [worldState, onGameOver, gameOverTimestamp, isGameOver]);

  return null;
}
