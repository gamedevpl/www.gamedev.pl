import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { CorpseEntity } from '../entities/characters/corpse-types';
import { HUMAN_GATHERING } from '../entities/characters/human/states/human-state-types';
import {
  BERRY_BUSH_CLAIM_DURATION_HOURS
} from '../berry-bush-consts.ts';
import {
  HUMAN_INTERACTION_RANGE
} from '../human-consts.ts';
import {
  EFFECT_DURATION_SHORT_HOURS
} from '../effect-consts.ts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';

const humanBerryBushGatherInteraction: InteractionDefinition<HumanEntity, BerryBushEntity> = {
  id: 'humanBerryBushGather',
  sourceType: 'human',
  targetType: 'berryBush',
  maxDistance: HUMAN_INTERACTION_RANGE,
  checker: (human: HumanEntity, berryBush: BerryBushEntity, context): boolean => {
    return (
      (human.isAdult &&
        berryBush.food.length > 0 &&
        human.stateMachine?.[0] === HUMAN_GATHERING &&
        human.food.length < human.maxFood &&
        (!human.gatheringCooldownTime || human.gatheringCooldownTime < context.gameState.time)) ||
      false
    );
  },
  perform: (human, berryBush, context): void => {
    const foodItem = berryBush.food.pop();
    if (foodItem) {
      human.food.push(foodItem);
    }

    human.gatheringCooldownTime = context.gameState.time + 1; // 1 second cooldown
    berryBush.timeSinceLastHarvest = context.gameState.time;

    // Claim the bush
    berryBush.ownerId = human.id;
    berryBush.claimedUntil = context.gameState.time + BERRY_BUSH_CLAIM_DURATION_HOURS;

    // Add visual effect for claiming the bush
    addVisualEffect(context.gameState, VisualEffectType.BushClaimed, berryBush.position, EFFECT_DURATION_SHORT_HOURS);

    // Play sound
    playSoundAt(context, SoundType.Gather, human.position);
  },
};

const corpseGatherInteraction: InteractionDefinition<HumanEntity, CorpseEntity> = {
  id: 'corpseGather',
  sourceType: 'human',
  targetType: 'corpse',
  maxDistance: HUMAN_INTERACTION_RANGE,
  checker: (human: HumanEntity, corpse: CorpseEntity, context): boolean => {
    return (
      (human.isAdult &&
        corpse.food.length > 0 &&
        human.stateMachine?.[0] === HUMAN_GATHERING &&
        human.food.length < human.maxFood &&
        (!human.gatheringCooldownTime || human.gatheringCooldownTime < context.gameState.time)) ||
      false
    );
  },
  perform: (human, corpse, context): void => {
    const foodItem = corpse.food.pop();
    if (foodItem) {
      human.food.push(foodItem);
    }
    human.gatheringCooldownTime = context.gameState.time + 1; // 1 second cooldown

    // Play sound
    playSoundAt(context, SoundType.Gather, human.position);
  },
};

export const humanGatherFoodInteractions = [humanBerryBushGatherInteraction, corpseGatherInteraction];
