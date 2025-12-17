import { State } from '../../../../state-machine/state-machine-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../../utils/math-utils';
import { HUMAN_THROW_RANGE } from '../../../../human-consts.ts';
import { HumanEntity } from '../human-types';
import { getEffectiveSpeed } from '../human-utils';
import { HUMAN_THROWING, HumanThrowingStateData, HUMAN_IDLE } from './human-state-types';
import { SOIL_DEPLETED_SPEED_BONUS } from '../../../plants/soil-depletion-consts';
import { getSoilSpeedModifier } from '../../../plants/soil-depletion-update';

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
    const { updateContext } = context;
    
    // Check if action is still throwing and target exists
    if (context.entity.activeAction !== 'throwing' || !context.entity.throwTargetId) {
      context.entity.activeAction = 'idle';
      return { nextState: HUMAN_IDLE, data: { ...data } };
    }
    
    const targetEntity = updateContext.gameState.entities.entities[context.entity.throwTargetId];
    if (!targetEntity) {
      context.entity.activeAction = 'idle';
      context.entity.throwTargetId = undefined;
      return { nextState: HUMAN_IDLE, data: { ...data } };
    }
    
    const distanceToTarget = calculateWrappedDistance(
      context.entity.position,
      targetEntity.position,
      updateContext.gameState.mapDimensions.width,
      updateContext.gameState.mapDimensions.height,
    );
    
    const dirToTarget = getDirectionVectorOnTorus(
      context.entity.position,
      targetEntity.position,
      updateContext.gameState.mapDimensions.width,
      updateContext.gameState.mapDimensions.height,
    );
    context.entity.direction = vectorNormalize(dirToTarget);
    
    // If target is too far, move closer first
    if (distanceToTarget > HUMAN_THROW_RANGE) {
      // Get terrain speed modifier from soil depletion state
      const terrainSpeedModifier = getSoilSpeedModifier(
        updateContext.gameState.soilDepletion,
        context.entity.position,
        updateContext.gameState.mapDimensions.width,
        updateContext.gameState.mapDimensions.height,
        SOIL_DEPLETED_SPEED_BONUS,
      );
      context.entity.acceleration = getEffectiveSpeed(context.entity, terrainSpeedModifier);
    } else {
      // In range - STOP to throw (key difference from melee attack)
      context.entity.acceleration = 0;
    }
    
    return { nextState: HUMAN_THROWING, data };
  },
};
