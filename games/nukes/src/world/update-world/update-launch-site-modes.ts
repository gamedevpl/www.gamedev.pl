import { WorldState, LaunchSiteMode } from '../world-state-types';
import { MODE_CHANGE_DURATION } from '../world-state-constants';

export function updateLaunchSiteModes(state: WorldState): void {
  for (const launchSite of state.launchSites) {
    if (launchSite.modeChangeTimestamp && state.timestamp >= launchSite.modeChangeTimestamp + MODE_CHANGE_DURATION) {
      launchSite.mode = launchSite.mode === LaunchSiteMode.ATTACK ? LaunchSiteMode.DEFENCE : LaunchSiteMode.ATTACK;
      launchSite.modeChangeTimestamp = undefined;
    }
  }
}
