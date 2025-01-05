import { LionEntity } from '../../entities/entities-types';
import { BaseStateData, State } from '../state-machine-types';
import { vectorDistance } from '../../utils/math-utils';

// Constants for lion behavior
const TARGET_REACHED_DISTANCE = 10;
const CHASE_ACCELERATION = 0.01;
const MOVE_ACCELERATION = 0.01;

// Lion state types
export type LionStateType = 'LION_IDLE' | 'LION_MOVING_TO_TARGET' | 'LION_CHASING';

// Lion state data interface
interface LionStateData extends BaseStateData {
  targetPosition?: { x: number; y: number } | null;
  targetEntityId?: number | null;
  lastTargetUpdate?: number;
}

// State Definitions
export const LION_IDLE_STATE: State<LionEntity, LionStateData> = {
  id: 'LION_IDLE',
  update: (data, context) => {
    const { entity } = context;

    // Check if we have a target
    if (entity.target.entityId || entity.target.position) {
      // Determine if target is an entity (chasing) or position (moving to target)
      const nextState = entity.target.entityId ? 'LION_CHASING' : 'LION_MOVING_TO_TARGET';
      return {
        nextState,
        data: {
          ...data,
          lastTargetUpdate: context.updateContext.gameState.time,
        },
      };
    }

    // Stay idle
    entity.acceleration = 0;
    return { nextState: 'LION_IDLE', data };
  },
  onEnter: (context) => ({
    enteredAt: context.updateContext.gameState.time,
  }),
};

export const LION_MOVING_TO_TARGET_STATE: State<LionEntity, LionStateData> = {
  id: 'LION_MOVING_TO_TARGET',
  update: (data, context) => {
    const { entity } = context;

    // Get current target position
    const targetPosition = entity.target.position;

    // If no target, return to idle
    if (!targetPosition) {
      return {
        nextState: 'LION_IDLE',
        data: { enteredAt: context.updateContext.gameState.time },
      };
    }

    // Check if target reached
    const distance = vectorDistance(entity.position, targetPosition);
    if (distance < TARGET_REACHED_DISTANCE) {
      entity.acceleration = 0;
      entity.target = {}; // Clear target
      return {
        nextState: 'LION_IDLE',
        data: { enteredAt: context.updateContext.gameState.time },
      };
    }

    // Move towards target
    moveTowardsTarget(entity, targetPosition.x, targetPosition.y, MOVE_ACCELERATION);

    return {
      nextState: 'LION_MOVING_TO_TARGET',
      data: {
        ...data,
        lastTargetUpdate: context.updateContext.gameState.time,
      },
    };
  },
  onEnter: (context) => ({
    enteredAt: context.updateContext.gameState.time,
  }),
};

export const LION_CHASING_STATE: State<LionEntity, LionStateData> = {
  id: 'LION_CHASING',
  update: (data, context) => {
    const { entity } = context;

    // Get current target position
    const targetEntity = context.updateContext.gameState.entities.entities.get(entity.target.entityId!);
    // If target lost, return to idle
    if (!targetEntity) {
      entity.target = {}; // Clear target
      return {
        nextState: 'LION_IDLE',
        data: { enteredAt: context.updateContext.gameState.time },
      };
    }

    // Move towards target with higher acceleration
    moveTowardsTarget(entity, targetEntity.position.x, targetEntity.position.y, CHASE_ACCELERATION);

    return {
      nextState: 'LION_CHASING',
      data: {
        ...data,
        targetEntityId: entity.target.entityId,
        lastTargetUpdate: context.updateContext.gameState.time,
      },
    };
  },
  onEnter: (context) => ({
    enteredAt: context.updateContext.gameState.time,
  }),
};

// Export all lion states
export const LION_STATES = [LION_IDLE_STATE, LION_MOVING_TO_TARGET_STATE, LION_CHASING_STATE];

// Initial state creator
export function createLionStateMachine(): [LionStateType, LionStateData] {
  return ['LION_IDLE', { enteredAt: 0 }];
}

// Helper function to update movement towards target
function moveTowardsTarget(entity: LionEntity, targetX: number, targetY: number, acceleration: number): void {
  const dx = targetX - entity.position.x;
  const dy = targetY - entity.position.y;

  entity.targetDirection = Math.atan2(dy, dx);
  entity.acceleration = acceleration;
}
