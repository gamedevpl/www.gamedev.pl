import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { CorpseEntity } from '../entities/characters/corpse-types';
import { TreeEntity } from '../entities/plants/tree/tree-types';
import { HUMAN_GATHERING } from '../entities/characters/human/states/human-state-types';
import { TREE_FALLEN, TREE_STUMP } from '../entities/plants/tree/states/tree-state-types';
import { HUMAN_INTERACTION_RANGE } from '../human-consts.ts';
import { EFFECT_DURATION_SHORT_HOURS } from '../effect-consts.ts';
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

    human.gatheringCooldownTime = context.gameState.time + 1; // 1 game hour cooldown
    berryBush.timeSinceLastHarvest = context.gameState.time;

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
    human.gatheringCooldownTime = context.gameState.time + 1; // 1 game hour cooldown

    // Play sound
    playSoundAt(context, SoundType.Gather, human.position);
  },
};

const humanGatherWoodInteraction: InteractionDefinition<HumanEntity, TreeEntity> = {
  id: 'humanGatherWood',
  sourceType: 'human',
  targetType: 'tree',
  maxDistance: HUMAN_INTERACTION_RANGE,
  checker: (human: HumanEntity, tree: TreeEntity, context): boolean => {
    return (
      (human.isAdult &&
        tree.stateMachine?.[0] === TREE_FALLEN &&
        tree.wood.length > 0 &&
        human.stateMachine?.[0] === HUMAN_GATHERING &&
        !human.heldItem &&
        (!human.gatheringCooldownTime || human.gatheringCooldownTime < context.gameState.time)) ||
      false
    );
  },
  perform: (human, tree, context): void => {
    const woodItem = tree.wood.pop();
    if (woodItem) {
      human.heldItem = woodItem;
    }
    human.gatheringCooldownTime = context.gameState.time + 1; // 1 game hour cooldown

    if (tree.wood.length === 0) {
      tree.stateMachine = [TREE_STUMP, { enteredAt: context.gameState.time, previousState: TREE_FALLEN }];
    }

    // Play sound
    playSoundAt(context, SoundType.Gather, human.position);
  },
};

export const humanGatherFoodInteractions = [
  humanBerryBushGatherInteraction,
  corpseGatherInteraction,
  humanGatherWoodInteraction,
];
