import { State } from '../../../../state-machine/state-machine-types';
import { HumanEntity } from '../human-types';
import { HUMAN_STUNNED, HumanStunnedStateData, HUMAN_IDLE } from './human-state-types';

export const humanStunnedState: State<HumanEntity, HumanStunnedStateData> = {
  id: HUMAN_STUNNED,
  onEnter: (context, nextData) => {
    // When entering stunned state, stop any movement
    context.entity.direction = { x: 0, y: 0 };
    context.entity.velocity = { x: 0, y: 0 };

    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
  update: (data, context) => {
    const { entity, updateContext } = context;
    const stateData = data as HumanStunnedStateData;

    // Check if the stun duration has passed
    if (updateContext.gameState.time >= stateData.stunnedUntil) {
      // Recover from stun
      entity.isStunned = false;
      entity.stunnedUntil = 0;
      entity.activeAction = 'idle';
      return { nextState: HUMAN_IDLE, data: { ...data, previousState: HUMAN_STUNNED } };
    }

    // Remain in the stunned state
    return { nextState: HUMAN_STUNNED, data };
  },
  onExit: (context) => {
    context.entity.isStunned = false;
    context.entity.stunnedUntil = 0;
  },
};
