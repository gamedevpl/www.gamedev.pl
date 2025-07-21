import { State } from '../../../../state-machine/state-machine-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../../utils/math-utils';
import { HUMAN_ATTACK_RANGE } from '../../../../world-consts';
import { HumanEntity } from '../human-types';
import { getEffectiveSpeed } from '../human-utils';
import { HUMAN_ATTACKING, HumanAttackingStateData, HUMAN_IDLE } from './human-state-types';

export const humanAttackingState: State<HumanEntity, HumanAttackingStateData> = {
  id: HUMAN_ATTACKING,
  onEnter: (context, nextData) => {
    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
      attackStartTime: context.updateContext.gameState.time,
    };
  },
  update: (data, context) => {
    if (context.entity.activeAction !== 'attacking' || !context.entity.attackTargetId) {
      context.entity.activeAction = 'idle';
      return { nextState: HUMAN_IDLE, data: { ...data } };
    }
    const targetEntity = context.updateContext.gameState.entities.entities.get(context.entity.attackTargetId);
    if (!targetEntity || targetEntity.type !== 'human') {
      context.entity.activeAction = 'idle';
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
    if (distanceToTarget > HUMAN_ATTACK_RANGE) {
      context.entity.acceleration = getEffectiveSpeed(context.entity);
    } else {
      context.entity.acceleration = 0;
    }
    // If the target is out of range, return to idle state
    return { nextState: HUMAN_ATTACKING, data };
  },
};
