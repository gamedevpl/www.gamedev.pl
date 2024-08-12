import { WorldState } from '../world-state-types';
import { INTERCEPT_RADIUS } from '../world-state-constants';
import { distance } from '../../math/position-utils';

export function handleMissileInterceptions(state: WorldState): WorldState {
  // Check for missile interceptions
  for (const interceptor of state.interceptors) {
    const targetMissile = state.missiles.find((m) => m.id === interceptor.targetMissileId);
    if (targetMissile) {
      const dist = distance(
        interceptor.position.x,
        interceptor.position.y,
        targetMissile.position.x,
        targetMissile.position.y,
      );
      if (dist < INTERCEPT_RADIUS) {
        // Interceptor has caught the missile
        state.missiles = state.missiles.filter((m) => m.id !== targetMissile.id);
        state.interceptors = state.interceptors.filter((i) => i.id !== interceptor.id);
      }
    }
  }
  return state;
}
