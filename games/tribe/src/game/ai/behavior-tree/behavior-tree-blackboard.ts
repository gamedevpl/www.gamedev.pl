import { NodeStatus } from './behavior-tree-types';
import {
  AI_UPDATE_INTERVAL,
  GAME_DAY_IN_REAL_SECONDS,
  HOURS_PER_GAME_DAY,
  UI_BT_DEBUG_HISTOGRAM_WINDOW_SECONDS,
} from '../../world-consts';

type NodeExecutionEntry = {
  lastExecuted: number;
  status: NodeStatus;
  depth: number;
  debugInfo: string;
  executionHistory: { time: number; status: NodeStatus }[];
};

/**
 * A generic key-value store for AI behavior trees.
 * Used to share data between different nodes in the tree.
 */
export class Blackboard {
  private data = new Map<string, unknown>();
  private nodeExecutionData = new Map<string, NodeExecutionEntry>();

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
   * @param debugInfo Additional debug info string for the node.
   */
  recordNodeExecution(name: string, status: NodeStatus, time: number, depth: number, debugInfo: string): void {
    const existingEntry = this.nodeExecutionData.get(name) || {
      lastExecuted: 0,
      status: NodeStatus.FAILURE, // Default
      depth: 0,
      debugInfo: '',
      executionHistory: [],
    };

    // Get last execution item
    const lastExecution = existingEntry.executionHistory[existingEntry.executionHistory.length - 1];
    if (lastExecution && time - lastExecution?.time > AI_UPDATE_INTERVAL) {
      existingEntry.executionHistory.push({
        time: lastExecution.time + AI_UPDATE_INTERVAL,
        status: NodeStatus.NOT_EVALUATED,
      });
    }

    // Add current execution to history
    existingEntry.executionHistory.push({ time, status });

    // Prune history to the last 30 seconds
    const historyWindowInGameHours =
      (UI_BT_DEBUG_HISTOGRAM_WINDOW_SECONDS / GAME_DAY_IN_REAL_SECONDS) * HOURS_PER_GAME_DAY;
    const historyStartTime = time - historyWindowInGameHours;

    existingEntry.executionHistory = existingEntry.executionHistory.filter((record) => record.time >= historyStartTime);

    // Update the main entry
    const updatedEntry: NodeExecutionEntry = {
      ...existingEntry,
      lastExecuted: time,
      status,
      depth,
      debugInfo,
    };

    this.nodeExecutionData.set(name, updatedEntry);
  }

  /**
   * Retrieves the execution data for all nodes.
   * @returns A map of node names to their execution data.
   */
  getNodeExecutionData(): Map<string, NodeExecutionEntry> {
    return this.nodeExecutionData;
  }
}
