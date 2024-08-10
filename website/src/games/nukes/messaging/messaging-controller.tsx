import { useState, useEffect } from 'react';
import { WorldState, Strategy, City, LaunchSite } from '../world/world-state-types';
import { dispatchMessage } from './messages';
import { dispatchAllianceProposal } from './alliance-proposal';
import { getCityPopulation } from '../world/world-state-utils';

export function MessagingController({ worldState }: { worldState: WorldState }) {
  const playerState = worldState.states.find((state) => state.isPlayerControlled);

  const [gameStarted, setGameStarted] = useState(false);
  const [previousStrategies, setPreviousStrategies] = useState<Record<string, Record<string, Strategy>>>({});
  const [previousCities, setPreviousCities] = useState<City[]>([]);
  const [previousLaunchSites, setPreviousLaunchSites] = useState<LaunchSite[]>([]);
  const [isDefeated, setIsDefeated] = useState(false);

  // We are running checks every 100 milliseconds
  const roundedTimestamp = Math.round(worldState.timestamp * 10) / 10;

  useEffect(() => {
    if (!gameStarted && worldState.timestamp > 0) {
      setGameStarted(true);
      dispatchMessage('The game has started!', worldState.timestamp, worldState.timestamp + 3);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundedTimestamp]);

  useEffect(() => {
    if (playerState) {
      const currentStrategies = Object.fromEntries(worldState.states.map((state) => [state.id, state.strategies]));

      for (const state of worldState.states) {
        for (const otherState of worldState.states.filter((otherState) => otherState.id !== state.id)) {
          // Check if other state became friendly towards player
          if (
            playerState &&
            otherState.id === playerState.id &&
            state.strategies[otherState.id] === Strategy.FRIENDLY &&
            otherState.strategies[state.id] !== Strategy.FRIENDLY &&
            previousStrategies[state.id]?.[otherState.id] !== Strategy.FRIENDLY
          ) {
            dispatchAllianceProposal(state, playerState, worldState, true);
          }

          // Check if states became allies
          if (
            otherState.strategies[state.id] === Strategy.FRIENDLY &&
            state.strategies[otherState.id] === Strategy.FRIENDLY &&
            (previousStrategies[otherState.id]?.[state.id] !== Strategy.FRIENDLY ||
              previousStrategies[state.id]?.[otherState.id] !== Strategy.FRIENDLY)
          ) {
            dispatchMessage(
              `${otherState.name} has formed alliance with ${state.isPlayerControlled ? 'you' : state.name}!`,
              roundedTimestamp,
              roundedTimestamp + 3,
            );
          }

          // Check if states started a war
          if (
            state.strategies[otherState.id] === Strategy.HOSTILE &&
            previousStrategies[state.id]?.[otherState.id] !== Strategy.HOSTILE
          ) {
            dispatchMessage(
              otherState.isPlayerControlled
                ? `${state.name} has declared war on You!`
                : `${state.isPlayerControlled ? 'You have' : state.name} declared war on ${otherState.name}!`,
              roundedTimestamp,
              roundedTimestamp + 3,
              undefined,
              undefined,
              undefined,
              state.isPlayerControlled || otherState.isPlayerControlled,
            );
          }
        }
      }

      setPreviousStrategies(currentStrategies);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundedTimestamp]);

  useEffect(() => {
    // Inform the player if their city is hit, tell the number of casualties
    if (playerState) {
      worldState.cities
        .filter((city) => city.stateId === playerState.id)
        .forEach((city) => {
          const previousCity = previousCities.find((prevCity) => prevCity.id === city.id);
          if (!previousCity) return; // Skip if it's a new city
          const currentPopulation = getCityPopulation(worldState, city.id) || 0;
          const previousPopulation = getCityPopulation({ ...worldState, cities: previousCities }, previousCity.id) || 0;
          const casualties = previousPopulation - currentPopulation;
          if (casualties > 0) {
            dispatchMessage(
              [`Your city ${city.name} has been hit!`, `${casualties} casualties reported.`],
              roundedTimestamp,
              roundedTimestamp + 3,
              undefined,
              undefined,
              false,
              true,
            );
          }
        });
    }
    setPreviousCities(worldState.cities.map((city) => ({ ...city })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundedTimestamp]);

  useEffect(() => {
    // Inform the user if their launch site is destroyed
    if (playerState) {
      const playerLaunchSites = worldState.launchSites.filter((site) => site.stateId === playerState.id);
      // Only check for destroyed launch sites if we have previous launch sites to compare
      if (previousLaunchSites.length > 0) {
        const destroyedLaunchSites = previousLaunchSites.filter(
          (prevSite) => !playerLaunchSites.some((site) => site.id === prevSite.id),
        );
        destroyedLaunchSites.forEach(() => {
          dispatchMessage(
            `One of your launch sites has been destroyed!`,
            roundedTimestamp,
            roundedTimestamp + 3,
            undefined,
            undefined,
            false,
            true,
          );
        });
      }
      setPreviousLaunchSites(playerLaunchSites);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundedTimestamp]);

  useEffect(() => {
    // Inform the user if they lost the game
    if (playerState && !isDefeated) {
      const playerCities = worldState.cities.filter((city) => city.stateId === playerState.id);
      const playerLaunchSites = worldState.launchSites.filter((site) => site.stateId === playerState.id);

      const hasPopulatedCities = playerCities.some((city) => getCityPopulation(worldState, city.id) > 0);

      if (!hasPopulatedCities && playerLaunchSites.length === 0) {
        dispatchMessage(
          ['You have been defeated.', 'All your cities are destroyed.', 'You have no remaining launch sites.'],
          roundedTimestamp,
          roundedTimestamp + 5,
          undefined,
          undefined,
          false,
          true,
        );
        setIsDefeated(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundedTimestamp]);

  return null;
}
