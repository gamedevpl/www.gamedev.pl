import { HumanEntity } from '../../../entities/characters/human/human-types';
import { Blackboard } from '../behavior-tree-blackboard';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode } from '../nodes';

/**
 * Creates the behavior for being idle. This is a fallback action.
 * The entity will stand still.
 * @returns A behavior node representing the idle behavior.
 */
export function createIdleWanderBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new ActionNode(
    (human, _context, blackboard) => {
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.target = undefined;
      // Clear any potential leftover data from previous behaviors
      Blackboard.set(blackboard, 'wanderTarget', undefined);
      return NodeStatus.SUCCESS; // Always succeeds as it's the final fallback.
    },
    'Idle', // Renamed from 'Idle/Wander'
    depth,
  );
}
