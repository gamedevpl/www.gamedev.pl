import { PREY_IDLE_STATE, PreyIdleStateData } from './prey-idle-state';
import { PREY_MOVING_STATE } from './prey-moving-state';
import { PREY_FLEEING_STATE } from './prey-fleeing-state';
import { PREY_EATING_STATE } from './prey-eating-state';
import { PREY_DRINKING_STATE } from './prey-drinking-state';

// Re-export all states
export { PREY_IDLE_STATE, PREY_MOVING_STATE, PREY_FLEEING_STATE, PREY_EATING_STATE, PREY_DRINKING_STATE };

// Export prey state types
export type PreyStateType = 'PREY_IDLE' | 'PREY_MOVING' | 'PREY_FLEEING' | 'PREY_EATING' | 'PREY_DRINKING';

// Export combined array of all prey states
export const PREY_STATES = [
  PREY_IDLE_STATE,
  PREY_MOVING_STATE,
  PREY_FLEEING_STATE,
  PREY_EATING_STATE,
  PREY_DRINKING_STATE,
];

/**
 * Creates initial prey state machine state
 * @returns Tuple of initial state type and data
 */
export function createPreyStateMachine(): [PreyStateType, PreyIdleStateData] {
  return ['PREY_IDLE', { enteredAt: 0 }];
}

// Export utility functions
export { shouldFlee, updateFleeing } from './prey-state-utils';
