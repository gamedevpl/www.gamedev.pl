import { getOffscreenCanvas } from './render-utils';

/**
 * Function type for rendering content into an offscreen canvas.
 */
export type RenderFn = (ctx: CanvasRenderingContext2D) => void;

/**
 * A generic LRU (Least Recently Used) cache for offscreen canvases.
 * Useful for caching complex rendering operations.
 */
export class SpriteCache {
  private cache = new Map<string, HTMLCanvasElement>();
  private maxSize: number;

  constructor(maxSize: number = 200) {
    this.maxSize = maxSize;
  }

  /**
   * Retrieves a cached canvas for the given key, or renders it if not found.
   * @param key Unique key for the sprite state.
   * @param width Width of the offscreen canvas.
   * @param height Height of the offscreen canvas.
   * @param renderFn Function that draws the sprite into the provided context.
   * @returns The offscreen canvas containing the rendered sprite.
   */
  getOrRender(key: string, width: number, height: number, renderFn: RenderFn): HTMLCanvasElement {
    const cached = this.cache.get(key);
    if (cached) {
      // LRU: Move to the end of the Map to mark it as most recently used
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }

    // Render new sprite
    const { canvas, ctx } = getOffscreenCanvas(width, height);
    renderFn(ctx);

    // Evict oldest if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, canvas);
    return canvas;
  }

  /**
   * Clears the cache.
   */
  clear(): void {
    this.cache.clear();
  }
}
