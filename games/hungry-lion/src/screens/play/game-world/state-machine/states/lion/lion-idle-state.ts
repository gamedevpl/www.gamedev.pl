import { LionEntity } from '../../../entities/entities-types';
import { MAX_EATING_DISTANCE } from '../../../game-world-consts';
import { getCarrion } from '../../../game-world-query';
import { vectorDistance } from '../../../utils/math-utils';
import { BaseStateData, State } from '../../state-machine-types';

/**
 * State data interface for lion idle state
 */
export type LionIdleStateData = BaseStateData;

/**
 * Lion idle state implementation
 */
export const LION_IDLE_STATE: State<LionEntity, LionIdleStateData> = {
  id: 'LION_IDLE',

  update: (data, context) => {
    const { entity } = context;

    // Stop any residual movement
    entity.acceleration = 0;

    // --- Check for Transitions based on activeAction or input ---

    // Priority 1: Keyboard Movement
    if (entity.movementVector.x !== 0 || entity.movementVector.y !== 0) {
      // If keyboard input exists, always transition to moving
      return {
        nextState: 'LION_MOVING_TO_TARGET',
        data: { ...data },
      };
    }

    // Priority 2: Active Action set by UI/SPACE
    switch (entity.activeAction) {
      case 'attack':
        // If attack is active, check for an entity target
        if (entity.target.entityId) {
          const targetEntity = context.updateContext.gameState.entities.entities.get(entity.target.entityId);
          if (!targetEntity || targetEntity.type === 'carrion') {
            // If the target entity is no longer valid, clear the target
            entity.target.entityId = undefined;
            entity.activeAction = 'walk'; // Default to walk
          } else {
            return {
              nextState: 'LION_CHASING',
              data: { ...data },
            };
          }
        } else if (entity.target.position) {
          return {
            nextState: 'LION_MOVING_TO_TARGET',
            data: { ...data },
          };
        } else {
          // If attack is active but no target, stay idle (or perhaps switch to walk? TBD)
          // For now, stay idle and wait for GameController to provide a target or change action.
        }
        break;
      case 'walk':
        // If walk is active, check for a position target
        if (entity.target.position) {
          return {
            nextState: 'LION_MOVING_TO_TARGET',
            data: { ...data },
          };
        } else {
          // If walk is active but no position target, stay idle.
          // GameController handles setting position target from mouse/touch.
        }
        break;
      case 'ambush':
        // If ambush is active, transition to ambush state
        return {
          nextState: 'LION_AMBUSH',
          data: { enteredAt: context.updateContext.gameState.time },
        };
    }

    // Priority 3: Automatic Transitions (like eating nearby carrion)
    // Check if there is carrion nearby to eat
    const nearbyCarrion = getCarrion(context.updateContext.gameState).find((c) => {
      const distance = vectorDistance(entity.position, c.position);
      return distance < MAX_EATING_DISTANCE && c.food > 0;
    });

    if (nearbyCarrion) {
      // Set target to carrion and transition to eating state
      entity.target = { entityId: nearbyCarrion.id };
      return {
        nextState: 'LION_EATING',
        data: { enteredAt: context.updateContext.gameState.time },
      };
    }

    // --- Handle Idle Behavior (Turning) ---

    // If no transitions triggered, handle turning towards target if one exists
    // (even if the action isn't active, e.g., targeting prey but action is still 'walk')
    if (entity.target.entityId) {
      const targetEntity = context.updateContext.gameState.entities.entities.get(entity.target.entityId);
      if (targetEntity) {
        const dx = targetEntity.position.x - entity.position.x;
        const dy = targetEntity.position.y - entity.position.y;
        entity.targetDirection = Math.atan2(dy, dx);
      }
    } else if (entity.target.position) {
      const dx = entity.target.position.x - entity.position.x;
      const dy = entity.target.position.y - entity.position.y;
      entity.targetDirection = Math.atan2(dy, dx);
    }

    // Stay in idle state
    return { nextState: 'LION_IDLE', data };
  },

  onEnter: (context, nextData) => {
    const { entity } = context;

    // Clear acceleration when entering idle
    entity.acceleration = 0;

    // NOTE: We no longer reset activeAction here.
    // GameController is responsible for setting the activeAction based on user input.
    // When transitioning *to* idle (e.g., target reached, chase cancelled),
    // the GameController should set activeAction to 'walk' (or a default).

    return nextData;
  },
};
