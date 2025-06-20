import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { HumanCorpseEntity } from '../entities/characters/human/human-corpse-types';
import { HUMAN_GATHERING } from '../entities/characters/human/states/human-state-types';
import {
  BERRY_BUSH_CLAIM_DURATION_HOURS,
  HUMAN_INTERACTION_RANGE,
  EFFECT_DURATION_SHORT_HOURS,
  KARMA_ON_CLAIMED_BUSH_THEFT,
} from '../world-consts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { applyKarma } from '../karma/karma-utils';
import { areFamily } from '../utils/world-utils';

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

    // --- Karma for stealing ---
    if (berryBush.ownerId && berryBush.ownerId !== human.id) {
      const owner = context.gameState.entities.entities.get(berryBush.ownerId) as HumanEntity | undefined;
      if (owner && !areFamily(human, owner, context.gameState)) {
        // The gatherer (human) is the source of the negative karma for the owner.
        // So, the owner's karma towards the gatherer decreases.
        // Let's model it as the owner getting angry at the thief.
        // So owner is source, human is target
        applyKarma(owner, human, KARMA_ON_CLAIMED_BUSH_THEFT, context.gameState);
      }
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

const humanCorpseGatherInteraction: InteractionDefinition<HumanEntity, HumanCorpseEntity> = {
  id: 'humanCorpseGather',
  sourceType: 'human',
  targetType: 'humanCorpse',
  maxDistance: HUMAN_INTERACTION_RANGE,
  checker: (human: HumanEntity, corpse: HumanCorpseEntity, context): boolean => {
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

export const humanGatherFoodInteractions = [humanBerryBushGatherInteraction, humanCorpseGatherInteraction];
