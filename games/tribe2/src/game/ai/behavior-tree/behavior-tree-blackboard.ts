import { NodeStatus } from './behavior-tree-types';
import { AI_UPDATE_INTERVAL, BLACKBOARD_ENTRY_MAX_AGE_HOURS } from '../../ai-consts.ts';
import { GAME_DAY_IN_REAL_SECONDS, HOURS_PER_GAME_DAY } from '../../game-consts.ts';
import { UI_BT_DEBUG_HISTOGRAM_WINDOW_SECONDS } from '../../ui/ui-consts.ts';
import { Vector2D } from '../../utils/math-types.ts';

type NodeExecutionEntry = {
  lastExecuted: number;
  status: NodeStatus;
  depth: number;
  debugInfo: string;
  executionHistory: { time: number; status: NodeStatus }[];
};

type BlackboardValueType =
  | Vector2D
  | number
  | string
  | boolean
  | undefined
  | null
  | BlackboardValueType[]
  | { [key: string]: BlackboardValueType };

export type BlackboardData = {
  data: Record<string, BlackboardValueType>;
  nodeExecutionData: Record<string, NodeExecutionEntry>;
};

/**
 * A generic key-value store for AI behavior trees.
 * Used to share data between different nodes in the tree.
 */
export const Blackboard = {
  create(): BlackboardData {
    return {
      data: {},
      nodeExecutionData: {},
    };
  },

  /**
   * Stores a value in the blackboard.
   * @param key The key to store the value under.
   * @param value The value to store.
   */
  set<T extends BlackboardValueType>({ data }: BlackboardData, key: string, value: T): void {
    data[key] = value;
  },

  /**
   * Retrieves a value from the blackboard.
   * @param key The key of the value to retrieve.
   * @returns The value, or undefined if the key doesn't exist.
   */
  get<T extends BlackboardValueType>(blackboard: BlackboardData | undefined, key: string): T | undefined {
    return blackboard?.data[key] as T | undefined;
  },

  /**
   * Deletes a value from the blackboard.
   * @param key The key to delete.
   */
  delete({ data }: BlackboardData, key: string): void {
    delete data[key];
  },

  /**
   * Checks if a key exists in the blackboard.
   * @param key The key to check.
   * @returns True if the key exists, false otherwise.
   */
  has({ data }: BlackboardData, key: string): boolean {
    return key in data;
  },

  /**
   * Records the execution details of a behavior tree node.
   * @param name The name of the node.
   * @param status The execution status of the node.
   * @param time The game time of the execution.
   * @param depth The depth of the node in the tree.
   * @param debugInfo Additional debug info string for the node.
   */
  recordNodeExecution(
    { nodeExecutionData }: BlackboardData,
    name: string,
    status: NodeStatus,
    time: number,
    depth: number,
    debugInfo: string,
  ): void {
    const existingEntry = nodeExecutionData[name] || {
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

    nodeExecutionData[name] = updatedEntry;
  },

  /**
   * Retrieves the execution data for all nodes.
   * @returns A map of node names to their execution data.
   */
  getNodeExecutionData({ nodeExecutionData }: BlackboardData): Record<string, NodeExecutionEntry> {
    return nodeExecutionData;
  },

  /**
   * Cleans up old entries from the node execution data to prevent memory leaks.
   * This is called periodically from the main AI update loop.
   * @param currentTime The current game time in hours.
   */
  cleanupOldEntries({ nodeExecutionData }: BlackboardData, currentTime: number): void {
    const maxAge = BLACKBOARD_ENTRY_MAX_AGE_HOURS;
    const entriesToDelete: string[] = [];
    for (const [key, entry] of Object.entries(nodeExecutionData)) {
      if (currentTime - entry.lastExecuted > maxAge) {
        entriesToDelete.push(key);
      }
    }
    for (const key of entriesToDelete) {
      delete nodeExecutionData[key];
    }
  },
};
