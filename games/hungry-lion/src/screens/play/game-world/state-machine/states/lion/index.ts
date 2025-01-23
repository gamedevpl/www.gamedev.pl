import { LION_IDLE_STATE, LionIdleStateData } from './lion-idle-state';
import { LION_MOVING_TO_TARGET_STATE } from './lion-moving-state';
import { LION_CHASING_STATE } from './lion-chasing-state';
import { LION_AMBUSH_STATE } from './lion-ambush-state';

// Re-export all states
export { LION_IDLE_STATE, LION_MOVING_TO_TARGET_STATE, LION_CHASING_STATE, LION_AMBUSH_STATE };

// Export lion state types
export type LionStateType = 'LION_IDLE' | 'LION_MOVING_TO_TARGET' | 'LION_CHASING' | 'LION_AMBUSH';

// Export combined array of all lion states
export const LION_STATES = [LION_IDLE_STATE, LION_MOVING_TO_TARGET_STATE, LION_CHASING_STATE, LION_AMBUSH_STATE];

/**
 * Creates initial lion state machine state
 * @returns Tuple of initial state type and data
 */
export function createLionStateMachine(): [LionStateType, LionIdleStateData] {
  return ['LION_IDLE', { enteredAt: 0 }];
}
