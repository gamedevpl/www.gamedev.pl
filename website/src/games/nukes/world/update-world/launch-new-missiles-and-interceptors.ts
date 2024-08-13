import { LaunchSite, LaunchSiteMode, Missile, Interceptor, Position } from '../world-state-types';
import {
  LAUNCH_COOLDOWN,
  INTERCEPTOR_LAUNCH_COOLDOWN,
  MISSILE_SPEED,
  INTERCEPTOR_MAX_RANGE,
} from '../world-state-constants';
import { distance } from '../../math/position-utils';
import { IndexedWorldState } from '../world-state-index';

export function launchNewMissilesAndInterceptors(state: IndexedWorldState): void {
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
      const targetMissile = state.searchMissile.byProperty('id', targetMissileId)[0];
      if (targetMissile) {
        state.interceptors.push(createInterceptor(launchSite, state.timestamp, targetMissile));
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

function createInterceptor(launchSite: LaunchSite, worldTimestamp: number, targetMissile: Missile): Interceptor {
  return {
    id: Math.random() + '',
    stateId: launchSite.stateId,
    launchSiteId: launchSite.id,
    launch: launchSite.position,
    launchTimestamp: worldTimestamp,
    position: launchSite.position,
    direction: Math.atan2(
      launchSite.position.y - targetMissile.position.y,
      launchSite.position.x - targetMissile.position.x,
    ),
    tail: [],
    targetMissileId: targetMissile.id,
    maxRange: INTERCEPTOR_MAX_RANGE,
  };
}
