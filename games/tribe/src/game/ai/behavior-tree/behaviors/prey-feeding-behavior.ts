/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ANIMAL_CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD,
  ANIMAL_PARENT_FEEDING_RANGE,
} from '../../../world-consts';
import { PreyEntity } from '../../../entities/characters/prey/prey-types';
import { UpdateContext } from '../../../world-types';
import { findChildren } from '../../../utils/world-utils';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { Blackboard } from '../behavior-tree-blackboard';

const findHungriestChild = (prey: any, context: UpdateContext, blackboard: Blackboard) => {
  const children = findChildren(context.gameState, prey as any).filter((p: any) => !p.isAdult && p.type === 'prey') as unknown as PreyEntity[];
  if (children.length === 0) {
    return NodeStatus.FAILURE;
  }

  let hungriestChild: PreyEntity | null = null;
  let maxHunger = ANIMAL_CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD;

  for (const child of children) {
    if (child.hunger >= maxHunger) {
      maxHunger = child.hunger;
      hungriestChild = child;
    }
  }

  if (hungriestChild) {
    blackboard.set<PreyEntity>('targetChild', hungriestChild);
    return NodeStatus.SUCCESS;
  }

  return NodeStatus.FAILURE;
};

const moveToChildAndFeed = (prey: any, context: UpdateContext, blackboard: Blackboard) => {
  const child = blackboard.get<PreyEntity>('targetChild');
  if (!child) {
    return NodeStatus.FAILURE;
  }

  const distance = calculateWrappedDistance(
    prey.position,
    child.position,
    context.gameState.mapDimensions.width,
    context.gameState.mapDimensions.height,
  );

  if (distance > ANIMAL_PARENT_FEEDING_RANGE) {
    prey.activeAction = 'moving';
    prey.target = child.id;
    prey.direction = dirToTarget(prey.position, child.position, context.gameState.mapDimensions);
    return NodeStatus.RUNNING;
  }

  // Parent is in range, interaction system will handle the feeding.
  prey.activeAction = 'feeding';
  prey.target = undefined;
  blackboard.set('targetChild', undefined);
  return NodeStatus.SUCCESS;
};

/**
 * Creates a behavior tree node that handles a female prey feeding her hungry children.
 * Only female prey can feed children in the animal kingdom.
 *
 * This behavior is a sequence that will:
 * 1. Check if the prey is a female adult capable of feeding (not on cooldown).
 * 2. Find the hungriest child that needs food.
 * 3. Move towards the child.
 * 4. Succeed when in range, allowing the interaction system to perform the feeding.
 *
 * @returns A `BehaviorNode` that encapsulates the feeding child logic for prey.
 */
export function createPreyFeedingChildBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // Condition: Is the prey a female adult capable of feeding?
      new ConditionNode(
        (prey: any) =>
          (prey.isAdult &&
            prey.gender === 'female' &&
            prey.hunger < 80 && // Parent must not be too hungry
            (!prey.feedChildCooldownTime || prey.feedChildCooldownTime <= 0)) ??
          false,
        'Can Feed Child (Female Only)',
        depth + 1,
      ),
      // Action: Find the hungriest child and set it as the target.
      new ActionNode(findHungriestChild, 'Find Hungriest Prey Child', depth + 1),
      // Action: Move to the child and wait until in range.
      new ActionNode(moveToChildAndFeed, 'Move To Child and Feed', depth + 1),
    ],
    'Feed Prey Child',
    depth,
  );
}