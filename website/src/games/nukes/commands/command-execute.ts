import { State, WorldState, Strategy } from '../world/world-state-types';
import { CommandPayload, CommandType, ChatEntry } from './command-types';

export function executeCommand(
  command: CommandPayload,
  playerState: State,
  worldState: WorldState,
  setWorldState: (worldState: WorldState) => void,
): ChatEntry | undefined {
  switch (command.type) {
    case CommandType.ATTACK_STATE: {
      const state = worldState.states.find((state) => state.id === command.stateId);
      if (!state) {
        return {
          timestamp: worldState.timestamp,
          role: 'commander',
          message: "I don't understand who should be attacked",
        };
      } else if (playerState.strategies[command.stateId] === Strategy.HOSTILE) {
        return {
          timestamp: worldState.timestamp,
          role: 'commander',
          message: 'We are already attacking ' + state.name,
        };
      } else {
        playerState.strategies[command.stateId] = Strategy.HOSTILE;
        setWorldState({ ...worldState, states: worldState.states });
        return {
          timestamp: worldState.timestamp,
          role: 'commander',
          message: 'Affirmative, attacking ' + state.name,
        };
      }
    }
    case CommandType.ATTACK_CITY: {
      const city = worldState.cities.find((city) => city.id === command.cityId);
      if (!city) {
        return {
          timestamp: worldState.timestamp,
          role: 'commander',
          message: "I don't understand which city should be attacked",
        };
      }
      const launchSite = worldState.launchSites.find((site) => site.stateId === playerState.id);
      if (!launchSite) {
        return {
          timestamp: worldState.timestamp,
          role: 'commander',
          message: "We don't have any available launch sites",
        };
      }
      launchSite.nextLaunchTarget = city.position;
      setWorldState({ ...worldState, launchSites: worldState.launchSites });
      return {
        timestamp: worldState.timestamp,
        role: 'commander',
        message: 'Affirmative, targeting ' + city.name,
      };
    }
    case CommandType.ATTACK_LAUNCH_SITE: {
      const launchSite = worldState.launchSites.find((site) => site.id === command.launchSiteId);
      if (!launchSite) {
        return {
          timestamp: worldState.timestamp,
          role: 'commander',
          message: "I don't understand which launch site should be attacked",
        };
      }
      const playerLaunchSite = worldState.launchSites.find((site) => site.stateId === playerState.id);
      if (!playerLaunchSite) {
        return {
          timestamp: worldState.timestamp,
          role: 'commander',
          message: "We don't have any available launch sites",
        };
      }
      playerLaunchSite.nextLaunchTarget = launchSite.position;
      setWorldState({ ...worldState, launchSites: worldState.launchSites });
      return {
        timestamp: worldState.timestamp,
        role: 'commander',
        message: 'Affirmative, targeting enemy launch site',
      };
    }
    case CommandType.ATTACK_MISSILE:
      return {
        timestamp: worldState.timestamp,
        role: 'commander',
        message: "I don't know how to attack missiles.",
      };
  }
}
