import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { Blackboard } from '../behavior-tree-blackboard';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { unpackStatus } from './utils';

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
    private action: (
      human: HumanEntity,
      context: UpdateContext,
      blackboard: Blackboard,
    ) => [NodeStatus, string] | NodeStatus,
    name?: string,
    depth: number = 0,
  ) {
    this.name = name;
    this.depth = depth;
  }

  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    const [status, debugInfo] = unpackStatus(this.action(human, context, blackboard));
    this.lastStatus = status;
    if (this.name) {
      blackboard.recordNodeExecution(this.name, status, context.gameState.time, this.depth, debugInfo);
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
    private condition: (
      human: HumanEntity,
      context: UpdateContext,
      blackboard: Blackboard,
    ) => [boolean, string] | boolean,
    name?: string,
    depth: number = 0,
  ) {
    this.name = name;
    this.depth = depth;
  }

  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    let [result, debugInfo] = unpackStatus(this.condition(human, context, blackboard));
    const status = result ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
    this.lastStatus = status;
    if (this.name) {
      blackboard.recordNodeExecution(this.name, status, context.gameState.time, this.depth, debugInfo);
    }
    return status;
  }
}
