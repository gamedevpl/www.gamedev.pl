import { CharacterEntity } from '../../../entities/characters/character-types';
import { UpdateContext } from '../../../world-types';
import { Blackboard } from '../behavior-tree-blackboard';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { btProfiler } from '../bt-profiler';
import { unpackStatus } from './utils';

/**
 * A composite node that executes its children in order.
 * It succeeds if all children succeed. It fails as soon as one child fails.
 * If a child is running, the sequence is also running.
 */
export class Sequence<T extends CharacterEntity> implements BehaviorNode<T> {
  public name?: string;
  public lastStatus?: NodeStatus;
  public depth: number;

  constructor(public children: BehaviorNode<T>[], name?: string, depth: number = 0) {
    this.name = name;
    this.depth = depth;
    this.children.forEach((child) => {
      child.depth = (this.depth ?? 0) + 1;
    });
  }

  execute(entity: T, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    if (this.name) {
      btProfiler.nodeStart(this.name);
    }
    try {
      for (const child of this.children) {
        const [status, debugInfo] = unpackStatus(child.execute(entity, context, blackboard));
        if (status !== NodeStatus.SUCCESS) {
          this.lastStatus = status;
          if (this.name) {
            blackboard.recordNodeExecution(this.name, status, context.gameState.time, this.depth, debugInfo);
          }
          return status; // Return FAILURE or RUNNING immediately
        }
      }

      this.lastStatus = NodeStatus.SUCCESS;
      if (this.name) {
        blackboard.recordNodeExecution(this.name, NodeStatus.SUCCESS, context.gameState.time, this.depth, '');
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
export class Selector<T extends CharacterEntity> implements BehaviorNode<T> {
  public name?: string;
  public lastStatus?: NodeStatus;
  public depth: number;
  public runningChildIndex?: number;

  constructor(public children: BehaviorNode<T>[], name?: string, depth: number = 0) {
    this.name = name;
    this.depth = depth;
    this.children.forEach((child) => {
      child.depth = (this.depth ?? 0) + 1;
    });
  }

  execute(entity: T, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    if (this.name) {
      btProfiler.nodeStart(this.name);
    }
    try {
      const startIndex = this.runningChildIndex ?? 0;

      for (let i = startIndex; i < this.children.length; i++) {
        const child = this.children[i];
        const [status, debugInfo] = unpackStatus(child.execute(entity, context, blackboard));

        if (status === NodeStatus.FAILURE) {
          continue; // Try the next child
        }

        if (status === NodeStatus.SUCCESS) {
          delete this.runningChildIndex;
          this.lastStatus = NodeStatus.SUCCESS;
          if (this.name) {
            blackboard.recordNodeExecution(
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
          this.runningChildIndex = i;
          this.lastStatus = NodeStatus.RUNNING;
          if (this.name) {
            blackboard.recordNodeExecution(
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

      delete this.runningChildIndex;
      this.lastStatus = NodeStatus.FAILURE;
      if (this.name) {
        blackboard.recordNodeExecution(this.name, NodeStatus.FAILURE, context.gameState.time, this.depth, '');
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
 * A composite node that executes all of its children concurrently.
 * The exact success/failure condition can vary (e.g., succeed when one succeeds, or when all succeed).
 */
export class Parallel<T extends CharacterEntity> implements BehaviorNode<T> {
  public name?: string;
  public depth: number;
  constructor(public children: BehaviorNode<T>[], name?: string, depth: number = 0) {
    this.name = name;
    this.depth = depth;
    this.children.forEach((child) => {
      child.depth = (this.depth ?? 0) + 1;
    });
  }

  execute(entity: T, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    if (this.name) {
      btProfiler.nodeStart(this.name);
    }
    try {
      // TODO: Implement parallel execution logic.
      // This is more complex as it might involve managing running state for multiple children simultaneously.
      // For now, we can just execute them in sequence as a placeholder.
      this.children.forEach((child) => child.execute(entity, context, blackboard));
      return NodeStatus.SUCCESS;
    } finally {
      if (this.name) {
        btProfiler.nodeEnd();
      }
    }
  }
}
