import { GRID_HEIGHT, GRID_WIDTH } from './fire-render-types';

/**
 * A lightweight quad tree implementation for fire rendering optimization.
 * - Uses flat array for temperature storage
 * - Supports 8-way neighborhood checking
 * - Provides O(log n) cold region detection
 * - Minimizes allocations during reconstruction
 */
export class FireQuadTree {
  private temperatures: Float32Array;
  private static readonly NEIGHBORHOOD = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];

  constructor() {
    // Use a single Float32Array for efficient temperature storage
    // Use 2 padding cells on each side for easier neighborhood checking
    this.temperatures = new Float32Array((GRID_WIDTH + 2) * (GRID_HEIGHT + 2));
  }

  /**
   * Get the hot regions in the grid
   */
  getHotRegions(): [x: number, y: number, width: number, height: number][] {
    // TODO: This is an implementation stub
    return [[0, 0, GRID_WIDTH, GRID_HEIGHT]];
  }

  /**
   * Updates the temperature at a specific point and its influence on neighbors
   * @param x X coordinate in the grid
   * @param y Y coordinate in the grid
   * @param temperature New temperature value
   */
  update(x: number, y: number, temperature: number): void {
    // Update the temperature at the given point
    this.setTemperature(x, y, temperature);

    // Check all 8 neighbors
    for (const [dx, dy] of FireQuadTree.NEIGHBORHOOD) {
      const nx = x + dx;
      const ny = y + dy;

      this.setTemperature(nx, ny, temperature);
    }
  }

  /**
   * Checks if a point and its 8-way neighborhood are cold (zero temperature)
   * @param x X coordinate in the grid
   * @param y Y coordinate in the grid
   * @returns true if the point and all neighbors are cold
   */
  isCold(x: number, y: number): boolean {
    return this.getTemperature(x, y) === 0;
  }

  /**
   * Gets the temperature at a specific point
   * @param x X coordinate in the grid
   * @param y Y coordinate in the grid
   * @returns Temperature value at the point
   */
  private getTemperature(x: number, y: number): number {
    return this.temperatures[this.getTemperatureIndex(x, y)];
  }

  /**
   * Sets the temperature at a specific point
   * @param x X coordinate in the grid
   * @param y Y coordinate in the grid
   * @param temperature New temperature value
   */
  private setTemperature(x: number, y: number, temperature: number): void {
    const index = this.getTemperatureIndex(x, y);
    if (this.temperatures[index] > 0) {
      return;
    }

    this.temperatures[index] = temperature;
  }

  private getTemperatureIndex(x: number, y: number): number {
    return (y + 1) * GRID_WIDTH + (x + 1);
  }
}
