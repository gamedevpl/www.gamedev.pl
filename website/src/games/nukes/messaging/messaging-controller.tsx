import { useState, useEffect } from 'react';
import { WorldState, Strategy, City, LaunchSite } from '../world/world-state-types';
import { dispatchFullScreenMessage } from './full-screen-messages';

export function MessagingController({ worldState }: { worldState: WorldState }) {
  const playerState = worldState.states.find((state) => state.isPlayerControlled);

  const [gameStarted, setGameStarted] = useState(false);
  const [previousStrategies, setPreviousStrategies] = useState<Record<string, Strategy>>({});
  const [previousCities, setPreviousCities] = useState<City[]>([]);
  const [previousLaunchSites, setPreviousLaunchSites] = useState<LaunchSite[]>([]);
  const [warStartedBetween, setWarStartedBetween] = useState<Set<string>>(new Set());
  const [isDefeated, setIsDefeated] = useState(false);

  // We are running checks every 100 miliseconds
  const roundedTimestamp = Math.round(worldState.timestamp * 10) / 10;

  useEffect(() => {
    if (!gameStarted && worldState.timestamp > 0) {
      setGameStarted(true);
      dispatchFullScreenMessage('The game has started!', worldState.timestamp, worldState.timestamp + 3);
    }
  }, [worldState.timestamp > 0, gameStarted]);

  useEffect(() => {}, [worldState.timestamp > 0, gameStarted]);

  useEffect(() => {
    if (playerState) {
      const currentStrategies = playerState.strategies;

      // Check for strategy changes (wars starting)
      Object.entries(currentStrategies).forEach(([stateId, strategy]) => {
        if (strategy === Strategy.HOSTILE && previousStrategies[stateId] !== Strategy.HOSTILE) {
          const hostileState = worldState.states.find((state) => state.id === stateId);
          if (hostileState) {
            dispatchFullScreenMessage(
              `You have declared war on ${hostileState.name}!`,
              worldState.timestamp,
              worldState.timestamp + 3,
            );
          }
        }
        // Check if another state declared war on the player
        const otherState = worldState.states.find((state) => state.id === stateId);
        if (
          otherState &&
          otherState.strategies[playerState.id] === Strategy.HOSTILE &&
          previousStrategies[stateId] !== Strategy.HOSTILE
        ) {
          dispatchFullScreenMessage(
            `${otherState.name} has declared war on you!`,
            worldState.timestamp,
            worldState.timestamp + 3,
          );
        }
      });

      setPreviousStrategies(currentStrategies);
    }
  }, [roundedTimestamp]);

  useEffect(() => {
    // Inform the player if two other states start a war between themselves
    worldState.states.forEach((state1) => {
      worldState.states.forEach((state2) => {
        if (state1.id !== state2.id && state1.id !== playerState?.id && state2.id !== playerState?.id) {
          const warKey = `${state1.id}-${state2.id}`;
          if (state1.strategies[state2.id] === Strategy.HOSTILE && !warStartedBetween.has(warKey)) {
            dispatchFullScreenMessage(
              `${state1.name} has declared war on ${state2.name}!`,
              worldState.timestamp,
              worldState.timestamp + 3,
            );
            setWarStartedBetween(new Set(warStartedBetween).add(warKey));
          }
        }
      });
    });
  }, [roundedTimestamp]);

  useEffect(() => {
    // Inform the player if their city is hit, tell the number of casualties
    if (playerState) {
      worldState.cities
        .filter((city) => city.stateId === playerState.id)
        .forEach((city) => {
          const previousCity = previousCities.find((prevCity) => prevCity.id === city.id);
          if (!previousCity) return; // Skip if it's a new city
          const currentPopulation = city.populationHistogram[city.populationHistogram.length - 1].population;
          const previousPopulation = previousCity
            ? previousCity.populationHistogram[previousCity.populationHistogram.length - 1].population
            : currentPopulation;
          const casualties = previousPopulation - currentPopulation;
          console.log(`City hit: ${city.name}, Casualties: ${casualties}`); // Add logging for debugging
          if (casualties > 0) {
            dispatchFullScreenMessage(
              [`Your city ${city.name} has been hit!`, `${casualties} casualties reported.`],
              worldState.timestamp,
              worldState.timestamp + 3,
            );
          }
        });
    }
    setPreviousCities(
      worldState.cities.map((city) => ({ ...city, populationHistogram: [...city.populationHistogram] })),
    );
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
          dispatchFullScreenMessage(
            `One of your launch sites has been destroyed!`,
            worldState.timestamp,
            worldState.timestamp + 3,
          );
        });
      }
      setPreviousLaunchSites(playerLaunchSites);
    }
  }, [roundedTimestamp]);

  useEffect(() => {
    // Inform the user if they lost the game
    if (playerState && !isDefeated) {
      const playerCities = worldState.cities.filter((city) => city.stateId === playerState.id);
      const playerLaunchSites = worldState.launchSites.filter((site) => site.stateId === playerState.id);

      const hasPopulatedCities = playerCities.some((city) => {
        const currentPopulation = city.populationHistogram[city.populationHistogram.length - 1].population;
        return currentPopulation > 0;
      });

      if (!hasPopulatedCities && playerLaunchSites.length === 0) {
        dispatchFullScreenMessage(
          ['You have been defeated.', 'All your cities are destroyed.', 'You have no remaining launch sites.'],
          worldState.timestamp,
          worldState.timestamp + 5,
        );
        setIsDefeated(true);
      }
    }
  }, [roundedTimestamp, isDefeated]);

  return null;
}
