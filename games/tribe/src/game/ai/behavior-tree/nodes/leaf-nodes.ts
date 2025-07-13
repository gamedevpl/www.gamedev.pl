import { HumanEntity } from "../../../entities/characters/human/human-types";
import { UpdateContext } from "../../../world-types";
import { Blackboard } from "../behavior-tree-blackboard";
import { BehaviorNode, NodeStatus } from "../behavior-tree-types";

/**
 * A leaf node that performs a specific action and returns a status.
 */
export class ActionNode implements BehaviorNode {
  public name?: string;
  public lastStatus?: NodeStatus;
  public depth: number;

  /**
   * @param action The function to execute. It should return a NodeStatus.
   * @param name An optional name for debugging.
   * @param depth The depth of the node in the tree.
   */
  constructor(
    private action: (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => NodeStatus,
    name?: string,
    depth: number = 0,
  ) {
    this.name = name;
    this.depth = depth;
  }

  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    const status = this.action(human, context, blackboard);
    this.lastStatus = status;
    if (this.name) {
      blackboard.recordNodeExecution(this.name, status, context.gameState.time, this.depth);
    }
    return status;
  }
}

/**
 * A leaf node that checks a condition.
 * It returns SUCCESS if the condition is true, and FAILURE otherwise.
 */
export class ConditionNode implements BehaviorNode {
  public name?: string;
  public lastStatus?: NodeStatus;
  public depth: number;

  /**
   * @param condition The function to evaluate. It should return a boolean.
   * @param name An optional name for debugging.
   * @param depth The depth of the node in the tree.
   */
  constructor(
    private condition: (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => boolean,
    name?: string,
    depth: number = 0,
  ) {
    this.name = name;
    this.depth = depth;
  }

  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    const status = this.condition(human, context, blackboard) ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
    this.lastStatus = status;
    if (this.name) {
      blackboard.recordNodeExecution(this.name, status, context.gameState.time, this.depth);
    }
    return status;
  }
}
