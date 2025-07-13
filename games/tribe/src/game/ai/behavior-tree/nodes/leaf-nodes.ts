import { HumanEntity } from "../../../entities/characters/human/human-types";
import { UpdateContext } from "../../../world-types";
import { Blackboard } from "../behavior-tree-blackboard";
import { BehaviorNode, NodeStatus } from "../behavior-tree-types";

/**
 * A leaf node that performs a specific action and returns a status.
 */
export class ActionNode implements BehaviorNode {
  /**
   * @param action The function to execute. It should return a NodeStatus.
   */
  constructor(private action: (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => NodeStatus) {}

  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    return this.action(human, context, blackboard);
  }
}

/**
 * A leaf node that checks a condition.
 * It returns SUCCESS if the condition is true, and FAILURE otherwise.
 */
export class ConditionNode implements BehaviorNode {
  /**
   * @param condition The function to evaluate. It should return a boolean.
   */
  constructor(private condition: (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => boolean) {}

  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    return this.condition(human, context, blackboard) ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
  }
}
