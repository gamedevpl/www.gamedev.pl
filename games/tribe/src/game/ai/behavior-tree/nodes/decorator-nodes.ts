import { HumanEntity } from '../../../entities/characters/human/human-types';
import { AutopilotControls, UpdateContext } from '../../../world-types';
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
 * It stores the start time on the blackboard when the child first returns RUNNING.
 * If the child is still RUNNING after the timeout duration, it returns FAILURE.
 */
export class TimeoutNode implements BehaviorNode {
  public name: string;
  public lastStatus?: NodeStatus;
  public depth: number;
  private readonly startTimeKey: string;

  constructor(
    public readonly child: BehaviorNode,
    private readonly timeoutDurationHours: number,
    name: string,
    depth: number = 0,
  ) {
    this.name = name;
    this.depth = depth;
    this.child.depth = (this.depth ?? 0) + 1;
    this.startTimeKey = `timeout_${this.name}_startTime`;
  }

  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    const currentTime = context.gameState.time;
    let startTime = blackboard.get<number>(this.startTimeKey);

    const [childStatus, childDebugInfo] = unpackStatus(this.child.execute(human, context, blackboard));

    if (childStatus === NodeStatus.RUNNING) {
      if (startTime === undefined) {
        // First time this node is running, so store the start time.
        blackboard.set(this.startTimeKey, currentTime);
        startTime = currentTime;
      }

      const elapsedTime = currentTime - startTime;
      if (elapsedTime > this.timeoutDurationHours) {
        // Timeout exceeded.
        blackboard.delete(this.startTimeKey); // Clean up blackboard.
        this.lastStatus = NodeStatus.FAILURE;
        const debugInfo = `Timed out after ${elapsedTime.toFixed(2)}h.`;
        blackboard.recordNodeExecution(this.name, this.lastStatus, currentTime, this.depth, debugInfo);
        return this.lastStatus;
      }

      // Still running, within the time limit.
      this.lastStatus = NodeStatus.RUNNING;
      const debugInfo = `Running for ${elapsedTime.toFixed(2)}h. ${childDebugInfo}`;
      blackboard.recordNodeExecution(this.name, this.lastStatus, currentTime, this.depth, debugInfo);
      return this.lastStatus;
    }

    // Child succeeded or failed, so clear any existing start time.
    if (startTime !== undefined) {
      blackboard.delete(this.startTimeKey);
    }

    this.lastStatus = childStatus;
    blackboard.recordNodeExecution(this.name, this.lastStatus, currentTime, this.depth, childDebugInfo);
    return this.lastStatus;
  }
}

/**
 * A decorator node that caches the result of its child for a specified duration.
 * This is useful for wrapping expensive conditions or queries that don't need to be re-evaluated on every tick.
 * It does not cache a RUNNING status.
 * It requires a unique name to function correctly.
 */
export class CachingNode implements BehaviorNode {
  public name: string;
  public lastStatus?: NodeStatus;
  public depth: number;
  private readonly statusKey: string;
  private readonly timestampKey: string;

  constructor(
    public readonly child: BehaviorNode,
    private readonly cacheDurationHours: number,
    name: string, // Name is mandatory for CachingNode
    depth: number = 0,
    private readonly validityCheck?: (
      human: HumanEntity,
      context: UpdateContext,
      blackboard: Blackboard,
    ) => boolean,
  ) {
    this.name = name;
    this.depth = depth;
    this.child.depth = (this.depth ?? 0) + 1;
    this.statusKey = `caching_${this.name}_status`;
    this.timestampKey = `caching_${this.name}_timestamp`;
  }

  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    const currentTime = context.gameState.time;

    // --- Check Cache ---
    const cachedStatus = blackboard.get<NodeStatus>(this.statusKey);
    const cachedTimestamp = blackboard.get<number>(this.timestampKey);

    if (cachedStatus !== undefined && cachedTimestamp !== undefined) {
      const isExpired = currentTime - cachedTimestamp > this.cacheDurationHours;
      const isStillValid = this.validityCheck ? this.validityCheck(human, context, blackboard) : true;

      if (!isExpired && isStillValid) {
        const remaining = (cachedTimestamp + this.cacheDurationHours - currentTime).toFixed(2);
        const debugInfo = `Cache hit. Status: ${NodeStatus[cachedStatus]}. ${remaining}h left.`;
        this.lastStatus = cachedStatus;
        blackboard.recordNodeExecution(this.name, this.lastStatus, currentTime, this.depth, debugInfo);
        return this.lastStatus;
      }
    }

    // --- Cache Miss or Invalidated ---
    const [childStatus, childDebugInfo] = unpackStatus(this.child.execute(human, context, blackboard));

    // Only cache SUCCESS or FAILURE, not RUNNING.
    if (childStatus === NodeStatus.SUCCESS || childStatus === NodeStatus.FAILURE) {
      blackboard.set(this.statusKey, childStatus);
      blackboard.set(this.timestampKey, currentTime);
    }

    this.lastStatus = childStatus;
    const debugInfo = `Cache miss. Child returned ${NodeStatus[childStatus]}. ${childDebugInfo}`;
    blackboard.recordNodeExecution(this.name, this.lastStatus, currentTime, this.depth, debugInfo);
    return this.lastStatus;
  }
}

/**
 * A decorator node that prevents its child from running if a cooldown is active.
 * It succeeds if the child succeeds. It fails if the cooldown is active or the child fails.
 * It requires a unique name to function correctly.
 * If the child is already RUNNING, it will be allowed to continue, bypassing the cooldown.
 */
export class CooldownNode implements BehaviorNode {
  public name: string;
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

/**
 * A decorator node that only executes its child if the corresponding
 * autopilot behavior is enabled for the player character. For non-player
 * characters, it always executes the child.
 */
export class AutopilotControlled implements BehaviorNode {
  public name?: string;
  public lastStatus?: NodeStatus;
  public depth: number;

  constructor(
    public child: BehaviorNode,
    private readonly behaviorKey: keyof AutopilotControls['behaviors'],
    name?: string,
    depth: number = 0,
  ) {
    this.name = name;
    this.depth = depth;
    // Recursively update depth of all children for correct debug rendering
    const updateDepth = (node: BehaviorNode, newDepth: number) => {
      node.depth = newDepth;
      if (node.children) {
        node.children.forEach((childNode) => updateDepth(childNode, newDepth + 1));
      } else if (node.child) {
        updateDepth(node.child, newDepth + 1);
      }
    };
    updateDepth(this.child, (this.depth ?? 0) + 1);
  }

  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    const isPlayerAndBehaviorDisabled =
      human.isPlayer && context.gameState.autopilotControls.isActive && !context.gameState.autopilotControls.behaviors[this.behaviorKey];

    if (isPlayerAndBehaviorDisabled) {
      const debugInfo = `Player autopilot for '${this.behaviorKey}' is disabled.`;
      this.lastStatus = NodeStatus.FAILURE;
      if (this.name) {
        blackboard.recordNodeExecution(this.name, this.lastStatus, context.gameState.time, this.depth, debugInfo);
      }
      return this.lastStatus;
    }

    // For NPCs or for players with the behavior enabled, execute the child
    const [childStatus, debugInfo] = unpackStatus(this.child.execute(human, context, blackboard));
    this.lastStatus = childStatus;
    if (this.name) {
      blackboard.recordNodeExecution(this.name, this.lastStatus, context.gameState.time, this.depth, debugInfo);
    }

    return this.lastStatus;
  }
}
