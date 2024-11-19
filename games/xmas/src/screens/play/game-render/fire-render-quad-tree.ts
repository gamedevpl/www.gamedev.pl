import { GRID_HEIGHT, GRID_WIDTH } from './fire-render-types';

/**
 * A lightweight quad tree implementation for fire rendering optimization.
 * - Uses flat array for temperature storage
 * - Supports 8-way neighborhood checking
 * - Provides O(log n) cold region detection
 * - Minimizes allocations during reconstruction
 */
export class FireQuadTree {
  private temperaturesInsert: Uint8Array;
  private temperaturesRead: Uint8Array;

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
    // Use 2 padding cells on each side for easier neighborhood checking
    this.temperaturesInsert = new Uint8Array((GRID_WIDTH + 2) * (GRID_HEIGHT + 2));
    this.temperaturesRead = new Uint8Array((GRID_WIDTH + 2) * (GRID_HEIGHT + 2));
  }

  swapBuffers(): void {
    const temp = this.temperaturesInsert;
    this.temperaturesInsert = this.temperaturesRead;
    this.temperaturesRead = temp;

    this.temperaturesInsert.fill(0);
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
    return this.temperaturesRead[this.getTemperatureIndex(x, y)];
  }

  /**
   * Sets the temperature at a specific point
   * @param x X coordinate in the grid
   * @param y Y coordinate in the grid
   * @param temperature New temperature value
   */
  private setTemperature(x: number, y: number, temperature: number): void {
    const index = this.getTemperatureIndex(x, y);
    if (this.temperaturesInsert[index] > 0) {
      return;
    }

    this.temperaturesInsert[index] = temperature > 0 ? 1 : 0;
  }

  private getTemperatureIndex(x: number, y: number): number {
    return (y + 1) * GRID_WIDTH + (x + 1);
  }
}
