import { State } from '../../../../state-machine/state-machine-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../../utils/math-utils';
import { PREDATOR_ATTACK_RANGE } from '../../../../world-consts';
import { PredatorEntity } from '../predator-types';
import { PreyEntity } from '../../prey/prey-types';
import { HumanEntity } from '../../human/human-types';
import { getEffectivePredatorSpeed } from '../predator-utils';
import {
  PredatorStateData,
  PREDATOR_IDLE,
  PREDATOR_ATTACKING,
  PREDATOR_EATING,
  PredatorAttackingStateData,
  PredatorEatingStateData,
} from './predator-state-types';

// Define the predator attacking state
export const predatorAttackingState: State<PredatorEntity, PredatorStateData> = {
  id: PREDATOR_ATTACKING,
  update: (data, context) => {
    const { entity, updateContext } = context;

    // If found food (prey), prioritize eating
    if (entity.activeAction === 'eating') {
      return {
        nextState: PREDATOR_EATING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_ATTACKING,
          preyId: entity.attackTargetId!,
          eatingStartTime: updateContext.gameState.time,
        } as PredatorEatingStateData,
      };
    }

    // If not attacking anymore, go to idle
    if (entity.activeAction !== 'attacking' || !entity.attackTargetId) {
      entity.activeAction = 'idle';
      return {
        nextState: PREDATOR_IDLE,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_ATTACKING,
        },
      };
    }

    // Get target entity for direction and velocity calculation
    const targetEntity = updateContext.gameState.entities.entities.get(entity.attackTargetId);
    if (!targetEntity) {
      entity.activeAction = 'idle';
      return {
        nextState: PREDATOR_IDLE,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_ATTACKING,
        },
      };
    }

    // Check if target is dead (has hitpoints property and hitpoints <= 0)
    const isTargetDead = (
      (targetEntity.type === 'prey' && (targetEntity as PreyEntity).hitpoints <= 0) ||
      (targetEntity.type === 'predator' && (targetEntity as PredatorEntity).hitpoints <= 0) ||
      (targetEntity.type === 'human' && (targetEntity as HumanEntity).hitpoints <= 0)
    );
    
    if (isTargetDead) {
      entity.activeAction = 'idle';
      return {
        nextState: PREDATOR_IDLE,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_ATTACKING,
        },
      };
    }

    // Calculate distance and direction to target
    const distanceToTarget = calculateWrappedDistance(
      entity.position,
      targetEntity.position,
      updateContext.gameState.mapDimensions.width,
      updateContext.gameState.mapDimensions.height,
    );

    const dirToTarget = getDirectionVectorOnTorus(
      entity.position,
      targetEntity.position,
      updateContext.gameState.mapDimensions.width,
      updateContext.gameState.mapDimensions.height,
    );

    // Set direction towards target
    entity.direction = vectorNormalize(dirToTarget);

    // Set velocity based on distance to target
    if (distanceToTarget > PREDATOR_ATTACK_RANGE) {
      entity.acceleration = getEffectivePredatorSpeed(entity);
    } else {
      entity.acceleration = 0;
    }

    return { nextState: PREDATOR_ATTACKING, data: data as PredatorAttackingStateData };
  },
  onEnter: (context, nextData) => {
    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};