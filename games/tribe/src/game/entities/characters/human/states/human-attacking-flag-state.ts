import { State } from '../../../../state-machine/state-machine-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../../utils/math-utils';
import { HUMAN_ATTACK_RANGE } from '../../../../world-consts';
import { HumanEntity } from '../human-types';
import { getEffectiveSpeed } from '../human-utils';
import { HUMAN_ATTACKING_FLAG, HumanAttackingFlagStateData, HUMAN_IDLE } from './human-state-types';

export const humanAttackingFlagState: State<HumanEntity, HumanAttackingFlagStateData> = {
  id: HUMAN_ATTACKING_FLAG,
  onEnter: (context, nextData) => {
    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
  update: (data, context) => {
    const { entity, updateContext } = context;

    if (entity.activeAction !== 'attackingFlag' || !entity.attackTargetId) {
      entity.activeAction = 'idle';
      return { nextState: HUMAN_IDLE, data: { ...data } };
    }

    const targetFlag = updateContext.gameState.entities.entities.get(entity.attackTargetId);

    if (!targetFlag || targetFlag.type !== 'flag') {
      entity.activeAction = 'idle';
      entity.attackTargetId = undefined;
      return { nextState: HUMAN_IDLE, data: { ...data } };
    }

    const distanceToTarget = calculateWrappedDistance(
      entity.position,
      targetFlag.position,
      updateContext.gameState.mapDimensions.width,
      updateContext.gameState.mapDimensions.height,
    );

    const dirToTarget = getDirectionVectorOnTorus(
      entity.position,
      targetFlag.position,
      updateContext.gameState.mapDimensions.width,
      updateContext.gameState.mapDimensions.height,
    );
    entity.direction = vectorNormalize(dirToTarget);

    if (distanceToTarget > HUMAN_ATTACK_RANGE) {
      entity.acceleration = getEffectiveSpeed(entity);
    } else {
      entity.acceleration = 0;
    }

    return { nextState: HUMAN_ATTACKING_FLAG, data };
  },
};
