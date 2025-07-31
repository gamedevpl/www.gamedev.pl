import { ANIMAL_CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD, ANIMAL_PARENT_FEEDING_RANGE } from '../../../world-consts';
import { PredatorEntity } from '../../../entities/characters/predator/predator-types';
import { UpdateContext } from '../../../world-types';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { Blackboard } from '../behavior-tree-blackboard';
import { IndexedWorldState } from '../../../world-index/world-index-types';

const findHungriestChild = (predator: PredatorEntity, context: UpdateContext, blackboard: Blackboard) => {
  const children = (context.gameState as IndexedWorldState).search.predator
    .byProperty('motherId', predator.id)
    .filter((child) => !child.isAdult && child.type === 'predator') as unknown as PredatorEntity[];
  if (children.length === 0) {
    return NodeStatus.FAILURE;
  }

  let hungriestChild: PredatorEntity | null = null;
  let maxHunger = ANIMAL_CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD;

  for (const child of children) {
    if (child.hunger >= maxHunger) {
      maxHunger = child.hunger;
      hungriestChild = child;
    }
  }

  if (hungriestChild) {
    blackboard.set<PredatorEntity>('targetChild', hungriestChild);
    return NodeStatus.SUCCESS;
  }

  return NodeStatus.FAILURE;
};

const moveToChildAndFeed = (predator: PredatorEntity, context: UpdateContext, blackboard: Blackboard) => {
  const child = blackboard.get<PredatorEntity>('targetChild');
  if (!child) {
    return NodeStatus.FAILURE;
  }

  const distance = calculateWrappedDistance(
    predator.position,
    child.position,
    context.gameState.mapDimensions.width,
    context.gameState.mapDimensions.height,
  );

  if (distance > ANIMAL_PARENT_FEEDING_RANGE) {
    predator.activeAction = 'moving';
    predator.target = child.id;
    predator.direction = dirToTarget(predator.position, child.position, context.gameState.mapDimensions);
    return NodeStatus.RUNNING;
  }

  // Parent is in range, interaction system will handle the feeding.
  predator.activeAction = 'feeding';
  predator.target = undefined;
  blackboard.set('targetChild', undefined);
  return NodeStatus.SUCCESS;
};

/**
 * Creates a behavior tree node that handles a female predator feeding her hungry children.
 * Only female predators can feed children in the animal kingdom.
 *
 * This behavior is a sequence that will:
 * 1. Check if the predator is a female adult capable of feeding (not on cooldown).
 * 2. Find the hungriest child that needs food.
 * 3. Move towards the child.
 * 4. Succeed when in range, allowing the interaction system to perform the feeding.
 *
 * @returns A `BehaviorNode` that encapsulates the feeding child logic for predators.
 */
export function createPredatorFeedingChildBehavior(depth: number): BehaviorNode<PredatorEntity> {
  return new Sequence(
    [
      // Condition: Is the predator a female adult capable of feeding?
      new ConditionNode(
        (predator) => {
          return (
            (predator.isAdult &&
              predator.gender === 'female' &&
              predator.hunger < 90 && // Parent must not be too hungry
              (!predator.feedChildCooldownTime || predator.feedChildCooldownTime <= 0)) ??
            false
          );
        },
        'Can Feed Child (Female Only)',
        depth + 1,
      ),
      // Action: Find the hungriest child and set it as the target.
      new ActionNode(findHungriestChild, 'Find Hungriest Predator Child', depth + 1),
      // Action: Move to the child and wait until in range.
      new ActionNode(moveToChildAndFeed, 'Move To Child and Feed', depth + 1),
    ],
    'Feed Predator Child',
    depth,
  );
}
