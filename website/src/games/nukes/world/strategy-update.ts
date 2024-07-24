import { WorldState, Strategy } from "./world-state-types";
import { EXPLOSION_RADIUS } from "./world-state-constants";
import { distance } from "../math/position-utils";

/** Updates strategy of states depending on the situation */
export function strategyUpdate(worldState: WorldState): WorldState {
  // Iterate over all the missiles in the world state
  for (const missile of worldState.missiles.filter(
    (missile) => missile.launchTimestamp === worldState.timestamp
  )) {
    const launchingState = worldState.states.find(
      (state) => state.id === missile.stateId
    );
    const targetState =
      // Check if city or launch site is within explosion radius
      worldState.cities.find(
        (city) =>
          distance(
            city.position.x,
            city.position.y,
            missile.target.x,
            missile.target.y
          ) <= EXPLOSION_RADIUS
      )?.stateId ||
      worldState.launchSites.find(
        (site) =>
          distance(
            site.position.x,
            site.position.y,
            missile.target.x,
            missile.target.y
          ) <= EXPLOSION_RADIUS
      )?.stateId;

    // If both launching state and target state exist and they are different
    if (launchingState && targetState && launchingState.id !== targetState) {
      if (launchingState.strategies[targetState] !== Strategy.HOSTILE) {
        launchingState.strategies[targetState] = Strategy.HOSTILE;
      }

      const targetStateEntity = worldState.states.find(
        (state) => state.id === targetState
      );
      if (
        targetStateEntity &&
        targetStateEntity.strategies[launchingState.id] !== Strategy.HOSTILE
      ) {
        targetStateEntity.strategies[launchingState.id] = Strategy.HOSTILE;
      }
    }
  }

  for (const state of worldState.states) {
    const isStateHostile = Object.entries(state.strategies).some(
      ([stateId, strategy]) =>
        strategy === Strategy.HOSTILE &&
        worldState.launchSites.some(
          (launchSite) => launchSite.stateId === stateId
        )
    );

    if (!isStateHostile) {
      const stateLaunchSitesCount = worldState.launchSites.filter(
        (site) => site.stateId === state.id
      ).length;
      const candidates = worldState.states.filter(
        (candidateState) =>
          candidateState.id !== state.id &&
          state.strategies[candidateState.id] === Strategy.NEUTRAL &&
          worldState.launchSites.filter(
            (site) => site.stateId === candidateState.id
          ).length < stateLaunchSitesCount &&
          worldState.cities
            .filter((city) => city.stateId === candidateState.id)
            .some(
              (city) => city.populationHistogram.slice(-1)[0].population > 0
            )
      );

      if (candidates.length > 0) {
        const targetCandidate = candidates[0];
        state.strategies[targetCandidate.id] = Strategy.HOSTILE;
      }
    }
  }

  return worldState;
}
