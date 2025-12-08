/**
 * Performance profiling utility for detailed timing measurements
 */

export interface ProfileEntry {
  name: string;
  duration: number;
  count: number;
  children?: Map<string, ProfileEntry>;
}

class PerformanceProfiler {
  private entries: Map<string, ProfileEntry> = new Map();
  private activeTimers: Map<string, number> = new Map();
  private enabled = false;
  private callStack: string[] = [];

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  start(name: string): void {
    if (!this.enabled) return;
    
    const key = this.callStack.length > 0 
      ? `${this.callStack[this.callStack.length - 1]}>${name}`
      : name;
    
    this.callStack.push(name);
    this.activeTimers.set(key, performance.now());
  }

  end(name: string): void {
    if (!this.enabled) return;

    const expectedName = this.callStack.pop();
    if (expectedName !== name) {
      console.warn(`Profiler: Expected to end "${expectedName}" but got "${name}"`);
      return;
    }

    const key = this.callStack.length > 0
      ? `${this.callStack[this.callStack.length - 1]}>${name}`
      : name;

    const startTime = this.activeTimers.get(key);
    if (startTime === undefined) {
      console.warn(`Profiler: No start time found for "${key}"`);
      return;
    }

    const duration = performance.now() - startTime;
    this.activeTimers.delete(key);

    let entry = this.entries.get(key);
    if (!entry) {
      entry = { name: key, duration: 0, count: 0 };
      this.entries.set(key, entry);
    }

    entry.duration += duration;
    entry.count += 1;
  }

  reset(): void {
    this.entries.clear();
    this.activeTimers.clear();
    this.callStack = [];
  }

  getResults(): Map<string, ProfileEntry> {
    return new Map(this.entries);
  }

  printResults(minDuration = 0): void {
    const sortedEntries = Array.from(this.entries.entries())
      .filter(([_, entry]) => entry.duration >= minDuration)
      .sort((a, b) => b[1].duration - a[1].duration);

    console.log('\n=== Performance Profile Results ===');
    console.log('Name | Total Time (ms) | Avg Time (ms) | Count');
    console.log('---------------------------------------------------');
    
    for (const [key, entry] of sortedEntries) {
      const avgTime = entry.duration / entry.count;
      console.log(
        `${key.padEnd(40)} | ${entry.duration.toFixed(2).padStart(12)} | ${avgTime.toFixed(2).padStart(12)} | ${entry.count}`
      );
    }
    console.log('===================================\n');
  }

  getTopEntries(limit = 10): Array<[string, ProfileEntry]> {
    return Array.from(this.entries.entries())
      .sort((a, b) => b[1].duration - a[1].duration)
      .slice(0, limit);
  }
}

export const profiler = new PerformanceProfiler();
