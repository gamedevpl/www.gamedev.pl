import { HUNTER_PATROLLING_STATE, HunterPatrollingStateData } from './hunter-patrolling-state';
import { HUNTER_WAITING_STATE } from './hunter-waiting-state';
import { HUNTER_CHASING_STATE } from './hunter-chasing-state';
import { HUNTER_SHOOTING_STATE } from './hunter-shooting-state';
import { HUNTER_RELOADING_STATE } from './hunter-reloading-state';

// Re-export all states
export {
  HUNTER_PATROLLING_STATE,
  HUNTER_WAITING_STATE,
  HUNTER_CHASING_STATE,
  HUNTER_SHOOTING_STATE,
  HUNTER_RELOADING_STATE
};

// Export hunter state types
export type HunterStateType =
  | 'HUNTER_PATROLLING'
  | 'HUNTER_WAITING'
  | 'HUNTER_CHASING'
  | 'HUNTER_SHOOTING'
  | 'HUNTER_RELOADING';

// Export combined array of all hunter states
export const HUNTER_STATES = [
  HUNTER_PATROLLING_STATE,
  HUNTER_WAITING_STATE,
  HUNTER_CHASING_STATE,
  HUNTER_SHOOTING_STATE,
  HUNTER_RELOADING_STATE
];

/**
 * Creates initial hunter state machine state
 * @returns Tuple of initial state type and data
 */
export function createHunterStateMachine(): [HunterStateType, HunterPatrollingStateData] {
  return ['HUNTER_PATROLLING', { enteredAt: 0, targetPosition: null }];
}

// Export utility functions
export { detectLion, calculateShootingAccuracy } from './hunter-state-utils';