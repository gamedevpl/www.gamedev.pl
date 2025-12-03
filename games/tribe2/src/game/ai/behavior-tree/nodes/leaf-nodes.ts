import { CharacterEntity } from '../../../entities/characters/character-types';
import { UpdateContext } from '../../../world-types';
import { Blackboard, BlackboardData } from '../behavior-tree-blackboard';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { btProfiler } from '../bt-profiler';
import { unpackStatus } from './utils';

/**
 * A leaf node that performs a specific action and returns a status.
 */
export class ActionNode<T extends CharacterEntity> extends BehaviorNode<T> {
  public name?: string;
  public depth: number;

  /**
   * @param action The function to execute. It should return a NodeStatus.
   * @param name An optional name for debugging.
   * @param depth The depth of the node in the tree.
   */
  constructor(
    private action: (
      entity: T,
      context: UpdateContext,
      blackboard: BlackboardData,
    ) => [NodeStatus, string] | NodeStatus,
    name?: string,
    depth: number = 0,
  ) {
    super();
    this.name = name;
    this.depth = depth;
  }

  execute(entity: T, context: UpdateContext, blackboard: BlackboardData): NodeStatus {
    if (this.name) {
      btProfiler.nodeStart(this.name);
    }
    try {
      const [status, debugInfo] = unpackStatus(this.action(entity, context, blackboard));
      this.setLastStatus(entity, status);
      if (this.name) {
        Blackboard.recordNodeExecution(blackboard, this.name, status, context.gameState.time, this.depth, debugInfo);
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
export class ConditionNode<T extends CharacterEntity> extends BehaviorNode<T> {
  public name?: string;
  public depth: number;

  /**
   * @param condition The function to evaluate. It should return a boolean.
   * @param name An optional name for debugging.
   * @param depth The depth of the node in the tree.
   */
  constructor(
    private condition: (entity: T, context: UpdateContext, blackboard: BlackboardData) => [boolean, string] | boolean,
    name?: string,
    depth: number = 0,
  ) {
    super();
    this.name = name;
    this.depth = depth;
  }

  execute(entity: T, context: UpdateContext, blackboard: BlackboardData): NodeStatus {
    if (this.name) {
      btProfiler.nodeStart(this.name);
    }
    try {
      const [result, debugInfo] = unpackStatus(this.condition(entity, context, blackboard));
      const status = result ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
      this.setLastStatus(entity, status);
      if (this.name) {
        Blackboard.recordNodeExecution(blackboard, this.name, status, context.gameState.time, this.depth, debugInfo);
      }
      return status;
    } finally {
      if (this.name) {
        btProfiler.nodeEnd();
      }
    }
  }
}
