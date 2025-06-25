import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { FlagEntity } from '../entities/flag/flag-types';
import { HUMAN_INTERACTION_RANGE, FLAG_RECLAIM_DURATION_HOURS } from '../world-consts';
import { HumanReclaimingStateData, HUMAN_RECLAIMING } from '../entities/characters/human/states/human-state-types';

export const flagReclaimInteraction: InteractionDefinition<HumanEntity, FlagEntity> = {
  id: 'flag-reclaim',
  sourceType: 'human',
  targetType: 'flag',
  maxDistance: HUMAN_INTERACTION_RANGE,

  checker: (source, target, context) => {
    if (
      source.activeAction !== 'reclaiming' ||
      source.leaderId === target.leaderId ||
      source.stateMachine?.[0] !== HUMAN_RECLAIMING
    ) {
      return false;
    }

    const reclaimData = source.stateMachine[1] as HumanReclaimingStateData;
    if (reclaimData.flagId !== target.id) {
      return false;
    }

    const timeInState = context.gameState.time - reclaimData.enteredAt;
    return timeInState >= FLAG_RECLAIM_DURATION_HOURS;
  },

  perform: (source, target) => {
    // Change flag ownership
    if (source.leaderId && source.tribeBadge) {
      target.leaderId = source.leaderId;
      target.tribeBadge = source.tribeBadge;
    }

    // Reset the human's state
    source.activeAction = 'idle';
  },
};
