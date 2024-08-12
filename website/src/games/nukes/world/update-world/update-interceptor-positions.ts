import { WorldState } from '../world-state-types';
import { INTERCEPTOR_SPEED } from '../world-state-constants';

export function updateInterceptorPositions(state: WorldState, deltaTime: number): void {
  // Update current position of interceptors
  state.interceptors = state.interceptors.filter((interceptor) => {
    const targetMissile = state.missiles.find((m) => m.id === interceptor.targetMissileId);
    if (!targetMissile) {
      interceptor.targetMissileId = undefined;
    }

    const dx = targetMissile ? targetMissile.position.x - interceptor.position.x : Math.cos(interceptor.direction);
    const dy = targetMissile ? targetMissile.position.y - interceptor.position.y : Math.sin(interceptor.direction);
    const distanceToTarget = Math.sqrt(dx * dx + dy * dy);
    interceptor.direction = Math.atan2(dy, dx);

    if (targetMissile && distanceToTarget <= INTERCEPTOR_SPEED * deltaTime) {
      // Interceptor has reached the missile
      interceptor.position = { ...targetMissile.position };
    } else {
      // Move towards the missile
      const moveFraction = (INTERCEPTOR_SPEED * deltaTime) / distanceToTarget;
      interceptor.position = {
        x: interceptor.position.x + dx * moveFraction,
        y: interceptor.position.y + dy * moveFraction,
      };
    }

    interceptor.tail = [
      ...interceptor.tail.slice(-100),
      { timestamp: state.timestamp, position: interceptor.position },
    ];

    // Check if interceptor has exceeded its maximum range
    const distanceTraveled = INTERCEPTOR_SPEED * (state.timestamp - interceptor.launchTimestamp);
    return distanceTraveled <= interceptor.maxRange;
  });
}
