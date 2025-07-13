import { NodeStatus } from "./behavior-tree-types";

/**
 * A generic key-value store for AI behavior trees.
 * Used to share data between different nodes in the tree.
 */
export class Blackboard {
  private data = new Map<string, unknown>();
  private nodeExecutionData = new Map<string, { lastExecuted: number; status: NodeStatus; depth: number }>();

  /**
   * Stores a value in the blackboard.
   * @param key The key to store the value under.
   * @param value The value to store.
   */
  set<T>(key: string, value: T): void {
    this.data.set(key, value);
  }

  /**
   * Retrieves a value from the blackboard.
   * @param key The key of the value to retrieve.
   * @returns The value, or undefined if the key doesn't exist.
   */
  get<T>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }

  /**
   * Records the execution details of a behavior tree node.
   * @param name The name of the node.
   * @param status The execution status of the node.
   * @param time The game time of the execution.
   * @param depth The depth of the node in the tree.
   */
  recordNodeExecution(name: string, status: NodeStatus, time: number, depth: number): void {
    this.nodeExecutionData.set(name, { lastExecuted: time, status, depth });
  }

  /**
   * Retrieves the execution data for all nodes.
   * @returns A map of node names to their execution data.
   */
  getNodeExecutionData(): Map<string, { lastExecuted: number; status: NodeStatus; depth: number }> {
    return this.nodeExecutionData;
  }
}
