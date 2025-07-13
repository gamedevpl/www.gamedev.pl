import { HumanEntity } from "../../../entities/characters/human/human-types";
import { UpdateContext } from "../../../world-types";
import { Blackboard } from "../behavior-tree-blackboard";
import { BehaviorNode, NodeStatus } from "../behavior-tree-types";

/**
 * A composite node that executes its children in order.
 * It succeeds if all children succeed. It fails as soon as one child fails.
 * If a child is running, the sequence is also running.
 */
export class Sequence implements BehaviorNode {
  constructor(private children: BehaviorNode[]) {}

  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    for (const child of this.children) {
      const status = child.execute(human, context, blackboard);
      if (status !== NodeStatus.SUCCESS) {
        return status; // Return FAILURE or RUNNING immediately
      }
    }
    return NodeStatus.SUCCESS; // All children succeeded
  }
}

/**
 * A composite node that executes its children in order.
 * It succeeds as soon as one child succeeds. It fails if all children fail.
 * If a child is running, the selector is also running.
 */
export class Selector implements BehaviorNode {
  constructor(private children: BehaviorNode[]) {}

  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    for (const child of this.children) {
      const status = child.execute(human, context, blackboard);
      if (status !== NodeStatus.FAILURE) {
        return status; // Return SUCCESS or RUNNING immediately
      }
    }
    return NodeStatus.FAILURE; // All children failed
  }
}

/**
 * A composite node that executes all of its children concurrently.
 * The exact success/failure condition can vary (e.g., succeed when one succeeds, or when all succeed).
 */
export class Parallel implements BehaviorNode {
  constructor(private children: BehaviorNode[]) {}

  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    // TODO: Implement parallel execution logic.
    // This is more complex as it might involve managing running state for multiple children simultaneously.
    // For now, we can just execute them in sequence as a placeholder.
    this.children.forEach((child) => child.execute(human, context, blackboard));
    return NodeStatus.SUCCESS;
  }
}
