import { Vector2D } from '../../utils/math-types.ts';

export type BlackboardValueType =
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
};

/**
 * A generic key-value store for AI behavior trees.
 * Used to share data between different nodes in the tree.
 */
export const Blackboard = {
  create(): BlackboardData {
    return {
      data: {},
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
};
