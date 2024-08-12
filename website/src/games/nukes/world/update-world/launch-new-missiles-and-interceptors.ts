import { WorldState, LaunchSite, LaunchSiteMode, Missile, Interceptor, Position } from '../world-state-types';
import {
  LAUNCH_COOLDOWN,
  INTERCEPTOR_LAUNCH_COOLDOWN,
  MISSILE_SPEED,
  INTERCEPTOR_MAX_RANGE,
} from '../world-state-constants';
import { distance } from '../../math/position-utils';

export function launchNewMissilesAndInterceptors(state: WorldState): void {
  for (const launchSite of state.launchSites) {
    if (!launchSite.nextLaunchTarget) {
      // No target
      continue;
    }
    if (
      !!launchSite.lastLaunchTimestamp &&
      state.timestamp - launchSite.lastLaunchTimestamp <
        (launchSite.mode === LaunchSiteMode.ATTACK ? LAUNCH_COOLDOWN : INTERCEPTOR_LAUNCH_COOLDOWN)
    ) {
      // Not ready to launch yet
      continue;
    }

    if (launchSite.mode === LaunchSiteMode.ATTACK && launchSite.nextLaunchTarget?.type === 'position') {
      state.missiles.push(createMissile(launchSite, launchSite.nextLaunchTarget.position, state.timestamp));
    } else if (launchSite.mode === LaunchSiteMode.DEFENCE && launchSite.nextLaunchTarget?.type === 'missile') {
      const targetMissileId = launchSite.nextLaunchTarget.missileId;
      if (targetMissileId) {
        state.interceptors.push(createInterceptor(launchSite, state.timestamp, targetMissileId));
      }
    }

    launchSite.lastLaunchTimestamp = state.timestamp;
    launchSite.nextLaunchTarget = undefined;
  }
}

function createMissile(launchSite: LaunchSite, targetPosition: Position, worldTimestamp: number): Missile {
  return {
    id: Math.random() + '',
    stateId: launchSite.stateId,
    launchSiteId: launchSite.id,
    launch: launchSite.position,
    launchTimestamp: worldTimestamp,
    position: launchSite.position,
    target: targetPosition,
    targetTimestamp:
      worldTimestamp +
      distance(launchSite.position.x, launchSite.position.y, targetPosition.x, targetPosition.y) / MISSILE_SPEED,
  };
}

function createInterceptor(launchSite: LaunchSite, worldTimestamp: number, targetMissileId: string): Interceptor {
  return {
    id: Math.random() + '',
    stateId: launchSite.stateId,
    launchSiteId: launchSite.id,
    launch: launchSite.position,
    launchTimestamp: worldTimestamp,
    position: launchSite.position,
    direction: 0,
    tail: [],
    targetMissileId: targetMissileId,
    maxRange: INTERCEPTOR_MAX_RANGE,
  };
}
