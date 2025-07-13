import { BehaviorNode, NodeStatus } from './behavior-tree-types';
import { ActionNode, ConditionNode, Selector, Sequence } from './nodes';
import { createEatingBehavior } from './behaviors/eating-behavior';
import { createFleeingBehavior } from './behaviors/fleeing-behavior';
import { createGatheringBehavior } from './behaviors/gathering-behavior';
import { createIdleWanderBehavior } from './behaviors/idle-wander-behavior';
import { createProcreationBehavior } from './behaviors/procreation-behavior';

/**
 * Builds the complete behavior tree for a human entity.
 * The tree is a Selector at its root, which means it will try each branch
 * in order until one of them succeeds or is running. This creates a priority system.
 */
export function buildHumanBehaviorTree(): BehaviorNode {
  // The root of the tree is a Selector, which acts like an "OR" gate.
  // It will try each child branch in order until one succeeds or is running.
  const root = new Selector([
    // --- HIGHEST PRIORITY: SURVIVAL (FLEE) ---
    createFleeingBehavior(),

    // --- COMBAT BEHAVIORS ---
    // (Placeholders for future implementation)
    new Sequence([
      new ConditionNode(() => {
        return false;
      }),
      new ActionNode(() => {
        return NodeStatus.RUNNING;
      }),
    ]),

    // --- PERSONAL NEEDS (EAT) ---
    createEatingBehavior(),

    // --- RESOURCE MANAGEMENT (GATHER) ---
    createGatheringBehavior(),

    // --- SOCIAL & REPRODUCTION (PROCREATE) ---
    createProcreationBehavior(),

    // --- DEFAULT/FALLBACK BEHAVIOR (WANDER) ---
    createIdleWanderBehavior(),
  ]);

  return root;
}
