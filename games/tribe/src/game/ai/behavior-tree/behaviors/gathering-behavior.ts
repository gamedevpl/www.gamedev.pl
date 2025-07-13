import { HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING, HUMAN_INTERACTION_PROXIMITY } from '../../../world-consts';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { NodeStatus } from '../behavior-tree-types';
import { findClosestEntity } from '../../../utils/world-utils';
import { BerryBushEntity } from '../../../entities/plants/berry-bush/berry-bush-types';
import { HumanCorpseEntity } from '../../../entities/characters/human/human-corpse-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';
import { Blackboard } from '../behavior-tree-blackboard';

type FoodSource = BerryBushEntity | HumanCorpseEntity;

export function createGatheringBehavior(depth: number): Sequence {
  return new Sequence(
    [
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
          const hasCapacity = human.food.length < human.maxFood;
          if (!human.isAdult || !hasCapacity || human.hunger < HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING) {
            return false;
          }

          const closestBush = findClosestEntity<BerryBushEntity>(
            human,
            context.gameState,
            'berryBush',
            undefined,
            (b) => b.food.length > 0,
          );

          const closestCorpse = findClosestEntity<HumanCorpseEntity>(
            human,
            context.gameState,
            'humanCorpse',
            undefined,
            (c) => c.food.length > 0,
          );

          let foodSource: FoodSource | null = null;
          if (closestBush && closestCorpse) {
            const distToBush = calculateWrappedDistance(
              human.position,
              closestBush.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );
            const distToCorpse = calculateWrappedDistance(
              human.position,
              closestCorpse.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );
            foodSource = distToBush <= distToCorpse ? closestBush : closestCorpse;
          } else {
            foodSource = closestBush || closestCorpse;
          }

          if (foodSource) {
            blackboard.set('foodSource', foodSource);
            return true;
          }
          return false;
        },
        'Should Gather Food',
        depth + 1,
      ),
      new ActionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
          const target = blackboard.get<FoodSource>('foodSource');
          if (!target) {
            return NodeStatus.FAILURE;
          }

          const distance = calculateWrappedDistance(
            human.position,
            target.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          if (distance < HUMAN_INTERACTION_PROXIMITY) {
            human.activeAction = 'gathering';
            human.direction = { x: 0, y: 0 };
            human.targetPosition = undefined;
            return NodeStatus.SUCCESS; // Successfully started gathering
          } else {
            human.activeAction = 'moving';
            human.targetPosition = { ...target.position };
            const dirToTarget = getDirectionVectorOnTorus(
              human.position,
              target.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );
            human.direction = vectorNormalize(dirToTarget);
            return NodeStatus.RUNNING; // Moving towards the target
          }
        },
        'Move To Food and Gather',
        depth + 1,
      ),
    ],
    'Gather Food',
    depth,
  );
}
