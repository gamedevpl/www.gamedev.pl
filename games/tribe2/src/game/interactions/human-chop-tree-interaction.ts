import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { TreeEntity } from '../entities/plants/tree/tree-types';
import { HUMAN_CHOPPING } from '../entities/characters/human/states/human-state-types';
import { HUMAN_CHOPPING_RANGE } from '../human-consts.ts';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { TREE_GROWING, TREE_FULL, TREE_SPREADING, TREE_FALLEN } from '../entities/plants/tree/states/tree-state-types';
import { TREE_GROWTH_TIME_GAME_HOURS, TREE_MIN_WOOD, TREE_MAX_WOOD } from '../entities/plants/tree/tree-consts';
import { ItemType } from '../entities/item-types';

export const humanTreeChopInteraction: InteractionDefinition<HumanEntity, TreeEntity> = {
  id: 'humanTreeChop',
  sourceType: 'human',
  targetType: 'tree',
  maxDistance: HUMAN_CHOPPING_RANGE,
  checker: (human: HumanEntity, tree: TreeEntity, context): boolean => {
    const [treeState] = tree.stateMachine ?? [];
    const isStanding = treeState === TREE_GROWING || treeState === TREE_FULL || treeState === TREE_SPREADING;

    return (
      (human.isAdult &&
        isStanding &&
        human.stateMachine?.[0] === HUMAN_CHOPPING &&
        !human.heldItem &&
        (!human.gatheringCooldownTime || human.gatheringCooldownTime < context.gameState.time)) ||
      false
    );
  },
  perform: (human, tree, context): void => {
    const { gameState } = context;

    // 1. Transition tree to TREE_FALLEN state
    tree.stateMachine = [TREE_FALLEN, { enteredAt: gameState.time, previousState: tree.stateMachine?.[0] }];

    // 2. If woodGenerated is false, generate wood based on age
    if (!tree.woodGenerated) {
      const growthProgress = Math.min(1, tree.age / TREE_GROWTH_TIME_GAME_HOURS);
      const woodCount = Math.floor(TREE_MIN_WOOD + growthProgress * (TREE_MAX_WOOD - TREE_MIN_WOOD));

      tree.wood = Array.from({ length: woodCount }, () => ({
        itemType: 'item',
        type: ItemType.Wood,
        id: gameState.entities.nextEntityId++,
      }));
      tree.woodGenerated = true;
    }

    // 3. Stop the chopping state
    human.activeAction = 'idle';
    human.gatheringCooldownTime = gameState.time + 1; // 1 game hour cooldown

    // Play sound
    playSoundAt(context, SoundType.Gather, human.position);
  },
};
