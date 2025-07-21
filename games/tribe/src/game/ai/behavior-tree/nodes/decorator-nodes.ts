import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { Blackboard } from '../behavior-tree-blackboard';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { unpackStatus } from './utils';

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
    const [childStatus, debugInfo] = unpackStatus(this.child.execute(human, context, blackboard));
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
      blackboard.recordNodeExecution(this.name, finalStatus, context.gameState.time, this.depth, debugInfo);
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
    const [, debugInfo] = unpackStatus(this.child.execute(human, context, blackboard));
    const finalStatus = NodeStatus.SUCCESS;

    this.lastStatus = finalStatus;
    if (this.name) {
      blackboard.recordNodeExecution(this.name, finalStatus, context.gameState.time, this.depth, debugInfo);
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
    const [status, debugInfo] = unpackStatus(this.child.execute(human, context, blackboard));

    this.lastStatus = status;
    if (this.name) {
      blackboard.recordNodeExecution(this.name, status, context.gameState.time, this.depth, debugInfo);
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
    const [status, debugInfo] = unpackStatus(this.child.execute(human, context, blackboard));

    this.lastStatus = status;
    if (this.name) {
      blackboard.recordNodeExecution(this.name, status, context.gameState.time, this.depth, debugInfo);
    }
    return status;
  }
}

/**
 * A decorator node that prevents its child from running if a cooldown is active.
 * It succeeds if the child succeeds. It fails if the cooldown is active or the child fails.
 * It requires a unique name to function correctly.
 * If the child is already RUNNING, it will be allowed to continue, bypassing the cooldown.
 */
export class CooldownNode implements BehaviorNode {
  public name?: string;
  public lastStatus?: NodeStatus;
  public depth: number;
  private readonly cooldownKey: string;

  constructor(
    private readonly cooldownDurationHours: number,
    public readonly child: BehaviorNode,
    name: string, // Name is mandatory for CooldownNode
    depth: number = 0,
  ) {
    this.name = name;
    this.depth = depth;
    this.child.depth = (this.depth ?? 0) + 1;
    // Use the node name for a unique cooldown key in the blackboard
    this.cooldownKey = `cooldown_${this.name}`;
  }

  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    const currentTime = context.gameState.time;
    const cooldownEndTime = blackboard.get<number>(this.cooldownKey);

    // If the child was already running, let it continue execution, bypassing the cooldown check.
    // The cooldown should only prevent *starting* an action, not interrupt one in progress.
    if (this.child.lastStatus === NodeStatus.RUNNING) {
      const [childStatus, debugInfo] = unpackStatus(this.child.execute(human, context, blackboard));
      this.lastStatus = childStatus;
      if (this.name) {
        const runningDebugInfo = `Continuing running child. ${debugInfo}`;
        blackboard.recordNodeExecution(this.name, this.lastStatus, currentTime, this.depth, runningDebugInfo);
      }
      // Do NOT set the cooldown again; the action is merely continuing.
      return this.lastStatus;
    }

    // --- Child was not running, so check cooldown before allowing a new execution ---
    if (cooldownEndTime !== undefined && currentTime < cooldownEndTime) {
      const remaining = (cooldownEndTime - currentTime).toFixed(2);
      const debugInfo = `Cooldown active, ${remaining}h left`;
      this.lastStatus = NodeStatus.FAILURE;
      if (this.name) {
        blackboard.recordNodeExecution(this.name, this.lastStatus, currentTime, this.depth, debugInfo);
      }
      return this.lastStatus;
    }

    // Cooldown is not active. Execute the child.
    const [childStatus, debugInfo] = unpackStatus(this.child.execute(human, context, blackboard));

    // If the child succeeds or *starts* running for the first time, set the cooldown.
    if (childStatus === NodeStatus.SUCCESS || childStatus === NodeStatus.RUNNING) {
      blackboard.set(this.cooldownKey, currentTime + this.cooldownDurationHours);
    }

    this.lastStatus = childStatus;
    if (this.name) {
      blackboard.recordNodeExecution(this.name, this.lastStatus, currentTime, this.depth, debugInfo);
    }

    return this.lastStatus;
  }
}
