import { WorldState } from '../world-state-types';

export function updateMissilePositions(state: WorldState, worldTimestamp: number): WorldState {
  // Update current position of missiles
  for (const missile of state.missiles) {
    const progress = (worldTimestamp - missile.launchTimestamp) / (missile.targetTimestamp - missile.launchTimestamp);
    missile.position = {
      x: missile.launch.x + (missile.target.x - missile.launch.x) * progress,
      y: missile.launch.y + (missile.target.y - missile.launch.y) * progress,
    };
  }
  return state;
}
