import { Entity } from '../types/game-types';

/**
 * Updates the state machine for a given entity.
 * @param entity The entity whose state machine is to be updated.
 * @param deltaTime The time elapsed since the last frame in seconds.
 */
export function updateStateMachine(entity: Entity, deltaTime: number): void {
  const sm = entity.stateMachine;
  if (!sm) {
    return;
  }

  const currentState = sm.states[sm.currentState];
  if (currentState) {
    currentState.onUpdate(entity, deltaTime);
  }
}
