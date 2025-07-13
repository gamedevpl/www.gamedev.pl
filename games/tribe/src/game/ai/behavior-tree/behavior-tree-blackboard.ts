/**
 * A generic key-value store for AI behavior trees.
 * Used to share data between different nodes in the tree.
 */
export class Blackboard {
  private data = new Map<string, unknown>();

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
}
