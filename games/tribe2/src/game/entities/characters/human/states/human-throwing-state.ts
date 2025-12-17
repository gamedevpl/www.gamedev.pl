import { State } from '../../../../state-machine/state-machine-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../../utils/math-utils';
import { HUMAN_THROW_RANGE } from '../../../../human-consts.ts';
import { HumanEntity } from '../human-types';
import { getEffectiveSpeed } from '../human-utils';
import { HUMAN_THROWING, HumanThrowingStateData, HUMAN_IDLE } from './human-state-types';

/**
 * State for when a human is throwing a stone at a target.
 * The human must stop and aim before throwing.
 */
export const humanThrowingState: State<HumanEntity, HumanThrowingStateData> = {
  id: HUMAN_THROWING,
  onEnter: (context, nextData) => {
    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
      throwStartTime: context.updateContext.gameState.time,
    };
  },
  update: (data, context) => {
    // Check if action is still throwing and target exists
    if (context.entity.activeAction !== 'throwing' || !context.entity.throwTargetId) {
      context.entity.activeAction = 'idle';
      return { nextState: HUMAN_IDLE, data: { ...data } };
    }
    
    const targetEntity = context.updateContext.gameState.entities.entities[context.entity.throwTargetId];
    if (!targetEntity) {
      context.entity.activeAction = 'idle';
      context.entity.throwTargetId = undefined;
      return { nextState: HUMAN_IDLE, data: { ...data } };
    }
    
    const distanceToTarget = calculateWrappedDistance(
      context.entity.position,
      targetEntity.position,
      context.updateContext.gameState.mapDimensions.width,
      context.updateContext.gameState.mapDimensions.height,
    );
    
    const dirToTarget = getDirectionVectorOnTorus(
      context.entity.position,
      targetEntity.position,
      context.updateContext.gameState.mapDimensions.width,
      context.updateContext.gameState.mapDimensions.height,
    );
    context.entity.direction = vectorNormalize(dirToTarget);
    
    // If target is too far, move closer first
    if (distanceToTarget > HUMAN_THROW_RANGE) {
      context.entity.acceleration = getEffectiveSpeed(context.entity);
    } else {
      // In range - STOP to throw (key difference from melee attack)
      context.entity.acceleration = 0;
    }
    
    return { nextState: HUMAN_THROWING, data };
  },
};
