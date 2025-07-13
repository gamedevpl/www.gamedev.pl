import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { Blackboard } from './behavior-tree-blackboard';

/**
 * The status of a behavior tree node after execution.
 */
export enum NodeStatus {
  SUCCESS,
  FAILURE,
  RUNNING,
}

/**
 * Base interface for all nodes in the behavior tree.
 */
export interface BehaviorNode {
  name?: string;
  lastStatus?: NodeStatus;
  depth?: number;
  children?: BehaviorNode[];
  child?: BehaviorNode;
  /**
   * Executes the node's logic.
   * @param human The human entity executing the behavior.
   * @param context The current game update context.
   * @param blackboard The blackboard for sharing data between nodes.
   * @returns The status of the node after execution.
   */
  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus;
}
