import { HumanEntity } from '../entities/characters/human/human-types';
import { HUMAN_INTERACTION_RANGE } from '../human-consts';
import { InteractionDefinition } from './interactions-types';
import { UpdateContext } from '../world-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { fulfillDemand } from '../ai/supply-chain/tribe-logistics-utils';
import { getTribeLeaderForCoordination } from '../entities/tribe/tribe-task-utils';

export const supplyTransferInteraction: InteractionDefinition<HumanEntity, HumanEntity> = {
  id: 'supplyTransfer',
  sourceType: 'human',
  targetType: 'human',
  maxDistance: HUMAN_INTERACTION_RANGE,

  checker: (source, target) => {
    // Verify source is depositing
    if (source.activeAction !== 'depositing') {
      return false;
    }

    // Verify target is retrieving
    if (target.activeAction !== 'retrieving') {
      return false;
    }

    // Verify both belong to same tribe
    if (source.leaderId !== target.leaderId) {
      return false;
    }

    // Verify source has food
    if (source.food.length === 0) {
      return false;
    }

    // Verify target has space
    if (target.food.length >= target.maxFood) {
      return false;
    }

    return true;
  },

  perform: (source, target, context: UpdateContext) => {
    // Transfer food from source to target
    const amountToTransfer = Math.min(
      source.activeActionPayload?.amount || 1,
      source.food.length,
      target.maxFood - target.food.length,
    );

    const food = source.food.splice(0, amountToTransfer);
    target.food.push(...food);

    // Fulfill the demand in the logistics registry
    const leader = getTribeLeaderForCoordination(target, context.gameState);
    if (leader && leader.aiBlackboard) {
      fulfillDemand(leader.aiBlackboard, target.id, 'food');
    }

    // Reset source state
    source.activeAction = 'idle';
    source.target = undefined;
    source.activeActionPayload = undefined;

    // Reset target state
    target.activeAction = 'idle';
    target.target = undefined;

    // Play sound effect
    playSoundAt(context, SoundType.StorageDeposit, target.position);
  },
};
