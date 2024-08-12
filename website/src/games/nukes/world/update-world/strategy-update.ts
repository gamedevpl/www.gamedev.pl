import { WorldState, Strategy, State } from '../world-state-types';
import { EXPLOSION_RADIUS, CITY_RADIUS, STRATEGY_UPDATE_COOLDOWN } from '../world-state-constants';
import { distance } from '../../math/position-utils';

/** Updates strategy of states depending on the situation */
export function strategyUpdate(worldState: WorldState): WorldState {
  // Iterate over all the missiles in the world state which were just launched
  for (const missile of worldState.missiles.filter((missile) => missile.launchTimestamp === worldState.timestamp)) {
    const launchingState = worldState.states.find((state) => state.id === missile.stateId);
    const targetState =
      // Check if city or launch site is within explosion radius
      worldState.cities.find(
        (city) =>
          distance(city.position.x, city.position.y, missile.target.x, missile.target.y) <=
          EXPLOSION_RADIUS + CITY_RADIUS,
      )?.stateId ||
      worldState.launchSites.find(
        (site) => distance(site.position.x, site.position.y, missile.target.x, missile.target.y) <= EXPLOSION_RADIUS,
      )?.stateId;

    // If both launching state and target state exist and they are different
    if (launchingState && targetState && launchingState.id !== targetState) {
      if (launchingState.strategies[targetState] !== Strategy.HOSTILE) {
        launchingState.strategies[targetState] = Strategy.HOSTILE;
      }

      const targetStateEntity = worldState.states.find((state) => state.id === targetState);
      if (targetStateEntity && targetStateEntity.strategies[launchingState.id] !== Strategy.HOSTILE) {
        targetStateEntity.strategies[launchingState.id] = Strategy.HOSTILE;

        // New alliance mechanic: Check for friendly states of the target state
        worldState.states.forEach((allyState) => {
          if (
            allyState.id !== targetStateEntity.id &&
            allyState.strategies[targetStateEntity.id] === Strategy.FRIENDLY &&
            targetStateEntity.strategies[allyState.id] === Strategy.FRIENDLY
          ) {
            // Make the ally hostile towards the attacking state
            allyState.strategies[launchingState.id] = Strategy.HOSTILE;
            // Make the attacking state hostile towards the ally
            launchingState.strategies[allyState.id] = Strategy.HOSTILE;
          }
        });
      }
    }
  }

  // Strategy update for non player controlled states
  for (const state of worldState.states.filter((state) => !state.isPlayerControlled)) {
    stateStrategyUpdate(state, worldState);
  }

  return worldState;
}

function stateStrategyUpdate(state: State, worldState: WorldState) {
  if (state.lastStrategyUpdate && worldState.timestamp - state.lastStrategyUpdate < STRATEGY_UPDATE_COOLDOWN) {
    return;
  }

  state.lastStrategyUpdate = worldState.timestamp;

  const otherStates = worldState.states.filter((s) => s.id !== state.id);
  const allies = otherStates.filter(
    (s) => state.strategies[s.id] === Strategy.FRIENDLY && s.strategies[state.id] === Strategy.FRIENDLY,
  );

  // Copy strategies
  state.strategies = { ...state.strategies };

  // Respond to friendly proposals
  otherStates.forEach((otherState) => {
    if (otherState.strategies[state.id] === Strategy.FRIENDLY && state.strategies[otherState.id] === Strategy.NEUTRAL) {
      if (state.generalStrategy !== Strategy.HOSTILE) {
        state.strategies[otherState.id] = Strategy.FRIENDLY;
      } else {
        // reject proposal
        otherState.strategies[state.id] = Strategy.NEUTRAL;
      }
    }
  });

  // Respond to peace proposals
  otherStates.forEach((otherState) => {
    if (otherState.strategies[state.id] === Strategy.NEUTRAL && state.strategies[otherState.id] === Strategy.HOSTILE) {
      if (isWeakerState(state, otherState, allies, worldState)) {
        state.strategies[otherState.id] = Strategy.NEUTRAL;
      } else {
        // reject the proposal
        otherState.strategies[state.id] = Strategy.HOSTILE;
      }
    }
  });

  // Send friendly proposals
  const neutralStates = otherStates.filter(
    (s) =>
      Object.values(s.strategies).every((strategy) => strategy !== Strategy.HOSTILE) &&
      s.generalStrategy !== Strategy.HOSTILE,
  );
  if (neutralStates.length > 0 && state.generalStrategy === Strategy.FRIENDLY) {
    const randomNeutralState = neutralStates[Math.floor(Math.random() * neutralStates.length)];
    state.strategies[randomNeutralState.id] = Strategy.FRIENDLY;
  }

  // Declare war towards states who are hostile against your allies
  allies.forEach((ally) => {
    otherStates.forEach((potentialEnemy) => {
      if (
        potentialEnemy.strategies[ally.id] === Strategy.HOSTILE &&
        state.strategies[potentialEnemy.id] !== Strategy.HOSTILE
      ) {
        state.strategies[potentialEnemy.id] = Strategy.HOSTILE;
      }
    });
  });

  // Attack states which are weaker than you and your alliance
  const hostileStates = otherStates.filter(
    (s) => s.strategies[state.id] !== Strategy.FRIENDLY && state.strategies[s.id] !== Strategy.FRIENDLY,
  );
  hostileStates.forEach((enemy) => {
    if (isWeakerState(enemy, state, allies, worldState)) {
      const availableLaunchSites = worldState.launchSites.filter(
        (site) => site.stateId === state.id && !site.lastLaunchTimestamp,
      );
      if (availableLaunchSites.length > 0) {
        const randomLaunchSite = availableLaunchSites[Math.floor(Math.random() * availableLaunchSites.length)];
        const enemyTargets = [
          ...worldState.cities.filter((city) => city.stateId === enemy.id),
          ...worldState.launchSites.filter((site) => site.stateId === enemy.id),
        ];
        if (enemyTargets.length > 0) {
          const randomTarget = enemyTargets[Math.floor(Math.random() * enemyTargets.length)];
          randomLaunchSite.nextLaunchTarget = { type: 'position', position: randomTarget.position };
        }
      }
    }
  });
}

function isWeakerState(enemy: State, state: State, allies: State[], worldState: WorldState): boolean {
  const enemyAllies = worldState.states.filter(
    (s) =>
      enemy.strategies[s.id] === Strategy.FRIENDLY && s.strategies[enemy.id] === Strategy.FRIENDLY && s.id !== enemy.id,
  );
  const enemyLaunchSites = worldState.launchSites.filter(
    (site) => site.stateId === enemy.id || enemyAllies.some((ally) => ally.id === site.stateId),
  );
  const allianceLaunchSites = worldState.launchSites.filter(
    (site) => site.stateId === state.id || allies.some((ally) => ally.id === site.stateId),
  );

  if (enemyLaunchSites.length < allianceLaunchSites.length) {
    return true;
  }

  const enemyUnderAttack = worldState.missiles.some(
    (missile) =>
      worldState.cities.some(
        (city) =>
          city.stateId === enemy.id &&
          distance(city.position.x, city.position.y, missile.target.x, missile.target.y) <= EXPLOSION_RADIUS,
      ) ||
      worldState.launchSites.some(
        (site) =>
          site.stateId === enemy.id &&
          distance(site.position.x, site.position.y, missile.target.x, missile.target.y) <= EXPLOSION_RADIUS,
      ),
  );

  return enemyUnderAttack;
}
