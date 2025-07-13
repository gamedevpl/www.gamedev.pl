import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { Blackboard } from '../behavior-tree-blackboard';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';

/**
 * A decorator node that inverts the result of its child.
 * SUCCESS becomes FAILURE, and FAILURE becomes SUCCESS.
 * RUNNING remains RUNNING.
 */
export class Inverter implements BehaviorNode {
  public name?: string;
  public lastStatus?: NodeStatus;
  public depth: number;

  constructor(public child: BehaviorNode, name?: string, depth: number = 0) {
    this.name = name;
    this.depth = depth;
    this.child.depth = (this.depth ?? 0) + 1;
  }

  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    const childStatus = this.child.execute(human, context, blackboard);
    let finalStatus: NodeStatus;

    switch (childStatus) {
      case NodeStatus.SUCCESS:
        finalStatus = NodeStatus.FAILURE;
        break;
      case NodeStatus.FAILURE:
        finalStatus = NodeStatus.SUCCESS;
        break;
      case NodeStatus.RUNNING:
      default:
        finalStatus = childStatus;
        break;
    }

    this.lastStatus = finalStatus;
    if (this.name) {
      blackboard.recordNodeExecution(this.name, finalStatus, context.gameState.time, this.depth);
    }
    return finalStatus;
  }
}

/**
 * A decorator node that always returns SUCCESS, regardless of its child's status.
 */
export class Succeeder implements BehaviorNode {
  public name?: string;
  public lastStatus?: NodeStatus;
  public depth: number;

  constructor(public child: BehaviorNode, name?: string, depth: number = 0) {
    this.name = name;
    this.depth = depth;
    this.child.depth = (this.depth ?? 0) + 1;
  }

  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    this.child.execute(human, context, blackboard);
    const finalStatus = NodeStatus.SUCCESS;

    this.lastStatus = finalStatus;
    if (this.name) {
      blackboard.recordNodeExecution(this.name, finalStatus, context.gameState.time, this.depth);
    }
    return finalStatus;
  }
}

/**
 * A decorator node that repeats its child's execution a specified number of times.
 */
export class Repeater implements BehaviorNode {
  public name?: string;
  public lastStatus?: NodeStatus;
  public depth: number;

  constructor(public readonly child: BehaviorNode, name?: string, depth: number = 0) {
    this.name = name;
    this.depth = depth;
    this.child.depth = (this.depth ?? 0) + 1;
  }

  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    // TODO: Implement decorator logic
    const status = this.child.execute(human, context, blackboard);

    this.lastStatus = status;
    if (this.name) {
      blackboard.recordNodeExecution(this.name, status, context.gameState.time, this.depth);
    }
    return status;
  }
}

/**
 * A decorator node that fails if its child takes too long to execute.
 */
export class Timeout implements BehaviorNode {
  public name?: string;
  public lastStatus?: NodeStatus;
  public depth: number;

  constructor(public readonly child: BehaviorNode, name?: string, depth: number = 0) {
    this.name = name;
    this.depth = depth;
    this.child.depth = (this.depth ?? 0) + 1;
  }

  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    // TODO: Implement decorator logic
    const status = this.child.execute(human, context, blackboard);

    this.lastStatus = status;
    if (this.name) {
      blackboard.recordNodeExecution(this.name, status, context.gameState.time, this.depth);
    }
    return status;
  }
}
