import { State } from '../../../../state-machine/state-machine-types';
import { HumanEntity } from '../human-types';
import { HUMAN_ATTACKING, HumanAttackingStateData, HUMAN_IDLE } from './human-state-types';
import { playSound } from '../../../../sound/sound-utils';
import { SoundType } from '../../../../sound/sound-types';

export const humanAttackingState: State<HumanEntity, HumanAttackingStateData> = {
  id: HUMAN_ATTACKING,
  onEnter: (context, nextData) => {
    // When entering attacking state, stop any movement
    context.entity.acceleration = 0;
    context.entity.velocity = { x: 0, y: 0 };

    playSound(SoundType.Attack);

    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
  update: (data) => {
    // The 'attacking' action is instantaneous and handled by the interaction.
    // This state immediately transitions to idle.
    return { nextState: HUMAN_IDLE, data: { ...data } };
  },
};
