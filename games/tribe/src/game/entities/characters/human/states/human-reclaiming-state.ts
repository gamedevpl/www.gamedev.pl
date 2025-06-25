import { State } from '../../../../state-machine/state-machine-types';
import { HumanEntity } from '../human-types';
import { HUMAN_IDLE, HUMAN_RECLAIMING, HumanReclaimingStateData } from './human-state-types';
import { FLAG_RECLAIM_DURATION_HOURS } from '../../../../world-consts';

export const humanReclaimingState: State<HumanEntity, HumanReclaimingStateData> = {
  id: HUMAN_RECLAIMING,
  onEnter: (context, nextData) => {
    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
  update: (data, context) => {
    const { entity, updateContext } = context;
    const timeInState = updateContext.gameState.time - data.enteredAt;

    // The actual reclaiming logic is handled in the `flag-reclaim-interaction`
    // which checks if the human has been in this state for the required duration.
    // Here, we just check if the action is still valid.

    if (entity.activeAction !== 'reclaiming' || !data.flagId) {
      // Action was cancelled or changed
      return { nextState: HUMAN_IDLE, data: { ...data } };
    }

    const flag = updateContext.gameState.entities.entities.get(data.flagId);
    if (!flag || flag.type !== 'flag') {
      // Flag was destroyed or doesn't exist anymore
      return { nextState: HUMAN_IDLE, data: { ...data } };
    }

    if (timeInState >= FLAG_RECLAIM_DURATION_HOURS) {
      // Interaction will handle the rest, transition to idle
      entity.activeAction = 'idle';
      return { nextState: HUMAN_IDLE, data: { ...data } };
    }

    return { nextState: HUMAN_RECLAIMING, data };
  },
  onExit: (context) => {
    context.entity.activeAction = 'idle';
  },
};
