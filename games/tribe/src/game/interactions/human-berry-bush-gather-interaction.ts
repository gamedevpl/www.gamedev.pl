import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { HUMAN_GATHERING } from '../entities/characters/human/states/human-state-types';
import { BERRY_BUSH_CLAIM_DURATION_HOURS, HUMAN_INTERACTION_RANGE } from '../world-consts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { EFFECT_DURATION_SHORT_HOURS } from '../world-consts';

export const humanBerryBushGatherInteraction: InteractionDefinition<HumanEntity, BerryBushEntity> = {
  id: 'humanBerryBushGather',
  sourceType: 'human',
  targetType: 'berryBush',
  maxDistance: HUMAN_INTERACTION_RANGE,
  checker: (human: HumanEntity, berryBush: BerryBushEntity, context): boolean => {
    return (
      (human.isAdult && // Ensure human is an adult to gather
        berryBush.currentBerries > 0 &&
        human.stateMachine?.[0] === HUMAN_GATHERING &&
        human.berries < human.maxBerries &&
        (!human.gatheringCooldownTime || human.gatheringCooldownTime < context.gameState.time)) ||
      false
    );
  },
  perform: (human, berryBush, context): void => {
    human.berries += 1;
    berryBush.currentBerries -= 1;
    human.gatheringCooldownTime = context.gameState.time + 1; // 1 second cooldown
    berryBush.timeSinceLastHarvest = context.gameState.time;

    // Claim the bush
    berryBush.ownerId = human.id;
    berryBush.claimedUntil = context.gameState.time + BERRY_BUSH_CLAIM_DURATION_HOURS;

    // Add visual effect for claiming the bush
    addVisualEffect(context.gameState, VisualEffectType.BushClaimed, berryBush.position, EFFECT_DURATION_SHORT_HOURS);
  },
};
