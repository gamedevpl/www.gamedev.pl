/**
 * A simple profiler for the Behavior Tree to identify performance hotspots.
 * It tracks the execution time and call count for each node in the tree.
 */

// Interface for storing profiling data for a single node
interface ProfiledNode {
  path: string;
  totalTime: number;
  callCount: number;
  minTime: number;
  maxTime: number;
}

class BTProfiler {
  // Stores data for each profiled node, keyed by its full path
  private nodeData = new Map<string, ProfiledNode>();
  // Stack to keep track of the current execution path
  private pathStack: string[] = [];
  // Stack to keep track of the start times of the nodes in the current path
  private startTimeStack: number[] = [];

  /**
   * Called when a node's execution begins.
   * @param name The name of the node starting.
   */
  public nodeStart(name: string): void {
    this.pathStack.push(name);
    this.startTimeStack.push(performance.now());
  }

  /**
   * Called when a node's execution ends.
   */
  public nodeEnd(): void {
    if (this.startTimeStack.length === 0 || this.pathStack.length === 0) {
      console.error('BTProfiler: nodeEnd() called without a matching nodeStart().');
      return;
    }

    const endTime = performance.now();
    const startTime = this.startTimeStack.pop() as number;
    const duration = endTime - startTime;
    const path = this.pathStack.join(' > ');

    const data = this.nodeData.get(path) ?? {
      path,
      totalTime: 0,
      callCount: 0,
      minTime: Infinity,
      maxTime: -Infinity,
    };

    data.totalTime += duration;
    data.callCount++;
    data.minTime = Math.min(data.minTime, duration);
    data.maxTime = Math.max(data.maxTime, duration);

    this.nodeData.set(path, data);

    this.pathStack.pop();
  }

  /**
   * Prints a formatted report of the profiling data to the console.
   */
  public report(): void {
    const sortedData = Array.from(this.nodeData.values()).sort((a, b) => b.totalTime - a.totalTime);

    console.log('--- Behavior Tree Profiler Report ---');
    console.table(
      sortedData.map((data) => ({
        'Path': data.path,
        'Total Time (ms)': data.totalTime.toFixed(3),
        'Calls': data.callCount,
        'Avg Time (ms)': (data.totalTime / data.callCount).toFixed(3),
        'Min Time (ms)': data.minTime.toFixed(3),
        'Max Time (ms)': data.maxTime.toFixed(3),
      })),
    );
    console.log('------------------------------------');
  }

  /**
   * Resets all profiling data. Useful for testing.
   */
  public reset(): void {
    this.nodeData.clear();
    this.pathStack = [];
    this.startTimeStack = [];
  }
}

// Export a singleton instance of the profiler
export const btProfiler = new BTProfiler();
