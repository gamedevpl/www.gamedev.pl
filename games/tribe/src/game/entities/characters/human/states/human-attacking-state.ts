import { State } from '../../../../state-machine/state-machine-types';
import { HumanEntity } from '../human-types';
import { HUMAN_ATTACKING, HumanAttackingStateData, HUMAN_IDLE } from './human-state-types';
import { playSoundAt } from '../../../../sound/sound-manager';
import { SoundType } from '../../../../sound/sound-types';

export const humanAttackingState: State<HumanEntity, HumanAttackingStateData> = {
  id: HUMAN_ATTACKING,
  onEnter: (context, nextData) => {
    // When entering attacking state, stop any movement
    context.entity.acceleration = 0;
    context.entity.velocity = { x: 0, y: 0 };

    playSoundAt(context.updateContext, SoundType.Attack, context.entity.position);

    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
      attackStartTime: context.updateContext.gameState.time,
    };
  },
  update: (data, context) => {
    // The entity remains in the attacking state.
    // The transition to idle is now handled by the human-attack-interaction
    // after the attack is performed.
    if (context.entity.activeAction !== 'attacking') {
      return { nextState: HUMAN_IDLE, data: { ...data } };
    }
    return { nextState: HUMAN_ATTACKING, data };
  },
};
