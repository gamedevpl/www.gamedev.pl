import { CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD, PARENT_FEEDING_RANGE } from '../../../world-consts';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { findChildren } from '../../../utils/world-utils';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { Blackboard } from '../behavior-tree-blackboard';

const findHungriestChild = (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
  const children = findChildren(context.gameState, human).filter((h) => !h.isAdult);
  if (children.length === 0) {
    return NodeStatus.FAILURE;
  }

  let hungriestChild: HumanEntity | null = null;
  let maxHunger = CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD;

  for (const child of children) {
    if (child.hunger >= maxHunger) {
      maxHunger = child.hunger;
      hungriestChild = child;
    }
  }

  if (hungriestChild) {
    blackboard.set<HumanEntity>('targetChild', hungriestChild);
    return NodeStatus.SUCCESS;
  }

  return NodeStatus.FAILURE;
};

const moveToChildAndFeed = (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
  const child = blackboard.get<HumanEntity>('targetChild');
  if (!child) {
    return NodeStatus.FAILURE;
  }

  const distance = calculateWrappedDistance(
    human.position,
    child.position,
    context.gameState.mapDimensions.width,
    context.gameState.mapDimensions.height,
  );

  if (distance > PARENT_FEEDING_RANGE) {
    human.activeAction = 'moving';
    human.targetPosition = child.position;
    human.direction = dirToTarget(human.position, child.position, context.gameState.mapDimensions);
    return NodeStatus.RUNNING;
  }

  // Parent is in range, interaction system will handle the feeding.
  // We can clear the target and succeed.
  human.activeAction = 'idle';
  human.targetPosition = undefined;
  blackboard.set('targetChild', undefined);
  return NodeStatus.SUCCESS;
};

/**
 * Creates a behavior tree node that handles the entire process of a parent feeding a hungry child.
 *
 * This behavior is a sequence that will:
 * 1. Check if the parent is able to feed (has food, is an adult, not on cooldown).
 * 2. Find the hungriest child that needs food.
 * 3. Move towards the child.
 * 4. Succeeds when in range, allowing the interaction system to perform the feeding.
 *
 * @returns A `BehaviorNode` that encapsulates the feeding child logic.
 */
export function createFeedingChildBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // Condition: Is the parent capable of feeding?
      new ConditionNode(
        (human) =>
          (human.isAdult &&
            human.food.length > 0 &&
            (!human.feedChildCooldownTime || human.feedChildCooldownTime <= 0)) ??
          false,
        'Can Feed Child',
        depth + 1,
      ),
      // Action: Find the hungriest child and set it as the target.
      new ActionNode(findHungriestChild, 'Find Hungriest Child', depth + 1),
      // Action: Move to the child and wait until in range.
      new ActionNode(moveToChildAndFeed, 'Move To Child and Feed', depth + 1),
    ],
    'Feed Child',
    depth,
  );
}
