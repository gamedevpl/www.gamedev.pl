import { CharacterEntity } from '../../../entities/characters/character-types';
import { UpdateContext } from '../../../world-types';
import { Blackboard } from '../behavior-tree-blackboard';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { btProfiler } from '../bt-profiler';
import { unpackStatus } from './utils';

/**
 * A leaf node that performs a specific action and returns a status.
 */
export class ActionNode<T extends CharacterEntity> implements BehaviorNode<T> {
  public name?: string;
  public lastStatus?: NodeStatus;
  public depth: number;

  /**
   * @param action The function to execute. It should return a NodeStatus.
   * @param name An optional name for debugging.
   * @param depth The depth of the node in the tree.
   */
  constructor(
    private action: (entity: T, context: UpdateContext, blackboard: Blackboard) => [NodeStatus, string] | NodeStatus,
    name?: string,
    depth: number = 0,
  ) {
    this.name = name;
    this.depth = depth;
  }

  execute(entity: T, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    if (this.name) {
      btProfiler.nodeStart(this.name);
    }
    try {
      const [status, debugInfo] = unpackStatus(this.action(entity, context, blackboard));
      this.lastStatus = status;
      if (this.name) {
        blackboard.recordNodeExecution(this.name, status, context.gameState.time, this.depth, debugInfo);
      }
      return status;
    } finally {
      if (this.name) {
        btProfiler.nodeEnd();
      }
    }
  }
}

/**
 * A leaf node that checks a condition.
 * It returns SUCCESS if the condition is true, and FAILURE otherwise.
 */
export class ConditionNode<T extends CharacterEntity> implements BehaviorNode<T> {
  public name?: string;
  public lastStatus?: NodeStatus;
  public depth: number;

  /**
   * @param condition The function to evaluate. It should return a boolean.
   * @param name An optional name for debugging.
   * @param depth The depth of the node in the tree.
   */
  constructor(
    private condition: (entity: T, context: UpdateContext, blackboard: Blackboard) => [boolean, string] | boolean,
    name?: string,
    depth: number = 0,
  ) {
    this.name = name;
    this.depth = depth;
  }

  execute(entity: T, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    if (this.name) {
      btProfiler.nodeStart(this.name);
    }
    try {
      const [result, debugInfo] = unpackStatus(this.condition(entity, context, blackboard));
      const status = result ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
      this.lastStatus = status;
      if (this.name) {
        blackboard.recordNodeExecution(this.name, status, context.gameState.time, this.depth, debugInfo);
      }
      return status;
    } finally {
      if (this.name) {
        btProfiler.nodeEnd();
      }
    }
  }
}
