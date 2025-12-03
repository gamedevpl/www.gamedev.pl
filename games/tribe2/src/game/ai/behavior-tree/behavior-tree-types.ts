import { CharacterEntity } from '../../entities/characters/character-types';
import { UpdateContext } from '../../world-types';
import { Blackboard, BlackboardData } from './behavior-tree-blackboard';

/**
 * The status of a behavior tree node after execution.
 */
export enum NodeStatus {
  SUCCESS,
  FAILURE,
  RUNNING,
  NOT_EVALUATED,
}

/**
 * Base interface for all nodes in the behavior tree.
 *
 * --- Blackboard Keys Used by Decorator Nodes ---
 * - CachingNode:
 *   - `caching_{nodeName}_status`: Stores the cached NodeStatus.
 *   - `caching_{nodeName}_timestamp`: Stores the time the result was cached.
 * - TimeoutNode:
 *   - `timeout_{nodeName}_startTime`: Stores the time the child started running.
 */
export abstract class BehaviorNode<T extends CharacterEntity> {
  name?: string;
  depth?: number;
  children?: BehaviorNode<T>[];
  child?: BehaviorNode<T>;
  /**
   * Executes the node's logic.
   * @param human The human entity executing the behavior.
   * @param context The current game update context.
   * @param blackboard The blackboard for sharing data between nodes.
   * @returns The status of the node after execution.
   */
  abstract execute(entity: T, context: UpdateContext, blackboard: BlackboardData): [NodeStatus, string] | NodeStatus;

  getLastStatus(entity: T): NodeStatus {
    return Blackboard.get(entity.aiBlackboard!, `${this.name}_lastStatus`) ?? NodeStatus.NOT_EVALUATED;
  }
  setLastStatus(entity: T, status: NodeStatus): void {
    Blackboard.set(entity.aiBlackboard!, `${this.name}_lastStatus`, status);
  }

  getRunningChildIndex(entity: T): number | undefined {
    return Blackboard.get(entity.aiBlackboard!, `${this.name}_runningChildIndex`);
  }
  setRunningChildIndex(entity: T, index: number | undefined): void {
    Blackboard.set(entity.aiBlackboard!, `${this.name}_runningChildIndex`, index);
  }
}
