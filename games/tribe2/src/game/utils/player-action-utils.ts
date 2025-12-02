import {
  BERRY_COST_FOR_PLANTING
} from '../berry-bush-consts.ts';
import {
  HUMAN_ATTACK_RANGE,
  HUMAN_FOOD_HUNGER_REDUCTION,
  HUMAN_INTERACTION_RANGE
} from '../human-consts.ts';
import {
  PLAYER_CALL_TO_ATTACK_RADIUS
} from '../tribe-consts.ts';
import { CorpseEntity } from '../entities/characters/corpse-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { PreyEntity } from '../entities/characters/prey/prey-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { FoodType } from '../food/food-types';
import { PlayerActionHint, PlayerActionType } from '../ui/ui-types';
import { GameWorldState } from '../world-types';
import { IndexedWorldState } from '../world-index/world-index-types';
import { calculateWrappedDistance } from './math-utils';
import { findNearbyEnemiesOfTribe } from './ai-world-analysis-utils';
import { findClosestEntity } from './entity-finder-utils';
import { canSplitTribe } from './tribe-split-utils';
import { canProcreate, isHostile } from '.';

export function getAvailablePlayerActions(gameState: GameWorldState, player: HumanEntity): PlayerActionHint[] {
  const actions: PlayerActionHint[] = [];

  // Check for Eating
  if (player.food.length > 0 && player.hunger > HUMAN_FOOD_HUNGER_REDUCTION) {
    actions.push({ type: PlayerActionType.Eat, action: 'eating', key: 'f' });
  }

  // Check for Gathering Food
  if (player.food.length < player.maxFood) {
    const gatherBushTarget = findClosestEntity<BerryBushEntity>(
      player,
      gameState,
      'berryBush',
      HUMAN_INTERACTION_RANGE,
      (b) => b.food.length > 0,
    );

    const gatherCorpseTarget = findClosestEntity<CorpseEntity>(
      player,
      gameState,
      'corpse',
      HUMAN_INTERACTION_RANGE,
      (c) => c.food.length > 0,
    );

    let target: BerryBushEntity | CorpseEntity | null = null;
    if (gatherBushTarget && gatherCorpseTarget) {
      target =
        calculateWrappedDistance(
          player.position,
          gatherBushTarget.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        ) <=
        calculateWrappedDistance(
          player.position,
          gatherCorpseTarget.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        )
          ? gatherBushTarget
          : gatherCorpseTarget;
    } else {
      target = gatherBushTarget || gatherCorpseTarget;
    }

    if (target) {
      actions.push({ type: PlayerActionType.Gather, action: 'gathering', key: 'e', targetEntity: target });
    }
  }

  // Check for Procreation
  const procreationTarget = findClosestEntity<HumanEntity>(player, gameState, 'human', HUMAN_INTERACTION_RANGE, (h) =>
    canProcreate(player, h as HumanEntity, gameState),
  );
  if (procreationTarget) {
    actions.push({
      type: PlayerActionType.Procreate,
      action: 'procreating',
      key: 'r',
      targetEntity: procreationTarget,
    });
  }

  // Check for Feeding Child
  if (player.food.length > 0 && player.isAdult) {
    const hungryChild = findClosestEntity<HumanEntity>(player, gameState, 'human', HUMAN_INTERACTION_RANGE, (h) => {
      const human = h as HumanEntity;
      return (
        !human.isAdult &&
        (human.motherId === player.id || human.fatherId === player.id) &&
        human.hunger >= HUMAN_FOOD_HUNGER_REDUCTION
      );
    });
    if (hungryChild) {
      actions.push({
        type: PlayerActionType.FeedChild,
        action: 'feeding',
        key: 'h',
        targetEntity: hungryChild,
      });
    }
  }

  // Check for Attacking
  const attackTarget =
    findClosestEntity<HumanEntity>(player, gameState, 'human', HUMAN_ATTACK_RANGE, (h) =>
      isHostile(player, h as HumanEntity, gameState),
    ) ??
    findClosestEntity<PredatorEntity>(player, gameState, 'predator', HUMAN_ATTACK_RANGE) ??
    findClosestEntity<PreyEntity>(player, gameState, 'prey', HUMAN_ATTACK_RANGE);
  if (attackTarget) {
    actions.push({ type: PlayerActionType.Attack, action: 'attacking', key: 'q', targetEntity: attackTarget });
  }

  // Check for Planting
  if (player.food.filter((f) => f.type === FoodType.Berry).length >= BERRY_COST_FOR_PLANTING) {
    actions.push({ type: PlayerActionType.Plant, action: 'planting', key: 'b' });
  }

  // Check for Call to Attack
  if (player.leaderId === player.id && !player.isCallingToAttack) {
    const indexedState = gameState as IndexedWorldState;
    const nearbyEnemies = findNearbyEnemiesOfTribe(player, indexedState, PLAYER_CALL_TO_ATTACK_RADIUS);
    if (nearbyEnemies.length > 0) {
      actions.push({ type: PlayerActionType.CallToAttack, action: 'idle', key: 'v' });
    }
  }

  // Check for Tribe Split
  if (canSplitTribe(player, gameState).canSplit) {
    actions.push({ type: PlayerActionType.TribeSplit, action: 'idle', key: 'k' });
  }

  // Check for Follow Me
  if (player.leaderId === player.id && !player.isCallingToFollow) {
    actions.push({ type: PlayerActionType.FollowMe, action: 'idle', key: 'c' });
  }

  return actions;
}
