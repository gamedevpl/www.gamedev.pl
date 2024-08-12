import { WorldState, LaunchSiteMode } from '../world-state-types';
import { MODE_CHANGE_DURATION } from '../world-state-constants';

export function updateLaunchSiteModes(state: WorldState, worldTimestamp: number): WorldState {
  for (const launchSite of state.launchSites) {
    if (launchSite.modeChangeTimestamp && worldTimestamp >= launchSite.modeChangeTimestamp + MODE_CHANGE_DURATION) {
      launchSite.mode = launchSite.mode === LaunchSiteMode.ATTACK ? LaunchSiteMode.DEFENCE : LaunchSiteMode.ATTACK;
      launchSite.modeChangeTimestamp = undefined;
    }
  }
  return state;
}
