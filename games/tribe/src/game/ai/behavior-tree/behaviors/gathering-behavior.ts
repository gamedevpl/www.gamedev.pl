import {
  BT_GATHERING_SEARCH_COOLDOWN_HOURS,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING,
  HUMAN_INTERACTION_PROXIMITY,
} from '../../../world-consts';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { ActionNode, ConditionNode, CooldownNode, Selector, Sequence } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { findClosestEntity } from '../../../utils/world-utils';
import { BerryBushEntity } from '../../../entities/plants/berry-bush/berry-bush-types';
import { HumanCorpseEntity } from '../../../entities/characters/human/human-corpse-types';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';

type FoodSource = BerryBushEntity | HumanCorpseEntity;
const BLACKBOARD_KEY = 'foodSource';

/**
 * Creates a behavior tree for gathering food (from bushes or corpses).
 *
 * This behavior is stateful and optimized. It uses a selector to either continue
 * moving towards an existing target or to find a new one. The search for a new
 * food source is computationally more expensive, so it's wrapped in a CooldownNode
 * to prevent it from running on every single AI tick, improving performance.
 */
export function createGatheringBehavior(depth: number): BehaviorNode {
  // Action to find the closest food source and store it in the blackboard.
  const findFoodSourceAction = new ActionNode(
    (human, context, blackboard) => {
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
        blackboard.set(BLACKBOARD_KEY, foodSource);
        return [
          NodeStatus.SUCCESS,
          `Found food: ${foodSource.type} at ${foodSource.position.x.toFixed(0)},${foodSource.position.y.toFixed(0)}`,
        ];
      }
      return [NodeStatus.FAILURE, 'No food source found'];
    },
    'Find Closest Food Source',
    depth + 4,
  );

  // Action to move towards the food source and gather from it.
  const moveAndGatherAction = new ActionNode(
    (human, context, blackboard) => {
      const target = blackboard.get<FoodSource>(BLACKBOARD_KEY);

      // Guard: If no target, fail. This shouldn't happen if the sequence is structured correctly.
      if (!target || target.food.length === 0) {
        blackboard.delete(BLACKBOARD_KEY);
        return [NodeStatus.FAILURE, 'Food source is invalid or depleted'];
      }

      const distance = calculateWrappedDistance(
        human.position,
        target.position,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );

      // If close enough, start gathering. The state machine will handle the rest.
      if (distance < HUMAN_INTERACTION_PROXIMITY) {
        human.activeAction = 'gathering';
        human.direction = { x: 0, y: 0 };
        human.target = target.id; // Set target for interaction system
        // We don't clear the blackboard key here. The gathering state itself will consume the food.
        // If the human is interrupted, this behavior can resume.
        return [NodeStatus.SUCCESS, `Gathering from ${target.type}`];
      } else {
        // Not close enough, so move towards the target.
        human.activeAction = 'moving';
        human.target = target.id;
        human.direction = dirToTarget(human.position, target.position, context.gameState.mapDimensions);
        return [NodeStatus.RUNNING, `Moving to ${target.type}`];
      }
    },
    'Move To Food and Gather',
    depth + 3,
  );

  return new Sequence(
    [
      // 1. Initial condition checks.
      new ConditionNode(
        (human: HumanEntity) => {
          const hasCapacity = human.food.length < human.maxFood;
          const isHungryEnough = human.hunger > HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING;
          return (human.isAdult && hasCapacity && isHungryEnough) ?? false;
        },
        'Should Gather Food',
        depth + 1,
      ),
      // 2. Main logic: either continue gathering or find a new source.
      new Selector(
        [
          // Branch A: Continue with an existing target.
          new Sequence(
            [
              new ConditionNode((_, __, blackboard) => blackboard.has(BLACKBOARD_KEY), 'Has Food Source?', depth + 2),
              moveAndGatherAction,
            ],
            'Continue Gathering Action',
            depth + 2,
          ),
          // Branch B: Find a new food source (with a cooldown).
          new Sequence(
            [
              new CooldownNode(
                BT_GATHERING_SEARCH_COOLDOWN_HOURS,
                findFoodSourceAction,
                'Find Food Source Cooldown',
                depth + 3,
              ),
              moveAndGatherAction, // Once found, move and gather.
            ],
            'Find New Food Source and Gather',
            depth + 2,
          ),
        ],
        'Perform or Start Gathering',
        depth + 1,
      ),
    ],
    'Gather Food',
    depth,
  );
}
