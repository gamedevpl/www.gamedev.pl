import { CharacterEntity } from '../../../entities/characters/character-types';
import { UpdateContext } from '../../../world-types';
import { Blackboard, BlackboardData } from '../behavior-tree-blackboard';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { btProfiler } from '../bt-profiler';
import { unpackStatus } from './utils';

/**
 * A composite node that executes its children in order.
 * It succeeds if all children succeed. It fails as soon as one child fails.
 * If a child is running, the sequence is also running.
 */
export class Sequence<T extends CharacterEntity> extends BehaviorNode<T> {
  public name?: string;
  public depth: number;

  constructor(public children: BehaviorNode<T>[], name?: string, depth: number = 0) {
    super();
    this.name = name;
    this.depth = depth;
    this.children.forEach((child) => {
      child.depth = (this.depth ?? 0) + 1;
    });
  }

  execute(entity: T, context: UpdateContext, blackboard: BlackboardData): NodeStatus {
    if (this.name) {
      btProfiler.nodeStart(this.name);
    }
    try {
      for (const child of this.children) {
        const [status, debugInfo] = unpackStatus(child.execute(entity, context, blackboard));
        if (status !== NodeStatus.SUCCESS) {
          this.setLastStatus(entity, status);
          if (this.name) {
            Blackboard.recordNodeExecution(
              blackboard,
              this.name,
              status,
              context.gameState.time,
              this.depth,
              debugInfo,
            );
          }
          return status; // Return FAILURE or RUNNING immediately
        }
      }

      this.setLastStatus(entity, NodeStatus.SUCCESS);
      if (this.name) {
        Blackboard.recordNodeExecution(
          blackboard,
          this.name,
          NodeStatus.SUCCESS,
          context.gameState.time,
          this.depth,
          '',
        );
      }
      return NodeStatus.SUCCESS; // All children succeeded
    } finally {
      if (this.name) {
        btProfiler.nodeEnd();
      }
    }
  }
}

/**
 * A composite node that executes its children in order.
 * It succeeds as soon as one child succeeds. It fails if all children fail.
 * If a child is running, the selector is also running and will resume from that child on the next tick.
 */
export class Selector<T extends CharacterEntity> extends BehaviorNode<T> {
  public name?: string;
  public depth: number;

  constructor(public children: BehaviorNode<T>[], name?: string, depth: number = 0) {
    super();
    this.name = name;
    this.depth = depth;
    this.children.forEach((child) => {
      child.depth = (this.depth ?? 0) + 1;
    });
  }

  execute(entity: T, context: UpdateContext, blackboard: BlackboardData): NodeStatus {
    if (this.name) {
      btProfiler.nodeStart(this.name);
    }
    try {
      const startIndex = this.getRunningChildIndex(entity) ?? 0;

      for (let i = startIndex; i < this.children.length; i++) {
        const child = this.children[i];
        const [status, debugInfo] = unpackStatus(child.execute(entity, context, blackboard));

        if (status === NodeStatus.FAILURE) {
          continue; // Try the next child
        }

        if (status === NodeStatus.SUCCESS) {
          this.setRunningChildIndex(entity, undefined);
          this.setLastStatus(entity, NodeStatus.SUCCESS);
          if (this.name) {
            Blackboard.recordNodeExecution(
              blackboard,
              this.name,
              NodeStatus.SUCCESS,
              context.gameState.time,
              this.depth,
              debugInfo,
            );
          }
          return NodeStatus.SUCCESS;
        }

        if (status === NodeStatus.RUNNING) {
          this.setRunningChildIndex(entity, i);
          this.setLastStatus(entity, NodeStatus.RUNNING);
          if (this.name) {
            Blackboard.recordNodeExecution(
              blackboard,
              this.name,
              NodeStatus.RUNNING,
              context.gameState.time,
              this.depth,
              debugInfo,
            );
          }
          return NodeStatus.RUNNING;
        }
      }

      this.setRunningChildIndex(entity, undefined);
      this.setLastStatus(entity, NodeStatus.FAILURE);
      if (this.name) {
        Blackboard.recordNodeExecution(
          blackboard,
          this.name,
          NodeStatus.FAILURE,
          context.gameState.time,
          this.depth,
          '',
        );
      }
      return NodeStatus.FAILURE; // All children failed
    } finally {
      if (this.name) {
        btProfiler.nodeEnd();
      }
    }
  }
}

/**
 * A composite node that executes its children in order.
 * It executes all children regardless of their status.
 */
export class Parallel<T extends CharacterEntity> extends BehaviorNode<T> {
  public name?: string;
  public depth: number;

  constructor(public children: BehaviorNode<T>[], name?: string, depth: number = 0) {
    super();
    this.name = name;
    this.depth = depth;
    this.children.forEach((child) => {
      child.depth = (this.depth ?? 0) + 1;
    });
  }

  execute(entity: T, context: UpdateContext, blackboard: BlackboardData): NodeStatus {
    if (this.name) {
      btProfiler.nodeStart(this.name);
    }
    try {
      let allSuccess = true;

      for (const child of this.children) {
        const [status, debugInfo] = unpackStatus(child.execute(entity, context, blackboard));

        if (status === NodeStatus.FAILURE) {
          allSuccess = false;
        }

        if (this.name) {
          Blackboard.recordNodeExecution(blackboard, this.name, status, context.gameState.time, this.depth, debugInfo);
        }
      }

      const finalStatus = allSuccess ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
      this.setLastStatus(entity, finalStatus);
      return finalStatus;
    } finally {
      if (this.name) {
        btProfiler.nodeEnd();
      }
    }
  }
}
