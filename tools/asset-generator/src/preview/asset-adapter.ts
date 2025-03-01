/**
 * Asset Adapter Module
 * 
 * This module bridges the gap between Node.js canvas and browser canvas,
 * allowing assets designed for Node.js to work in the browser environment.
 */

import { Asset } from '../assets/assets-types';

/**
 * Interface that mimics the CanvasRenderingContext2D from Node.js canvas
 * This helps TypeScript understand the shape of our browser context
 */
export interface BrowserCanvasRenderingContext2D extends CanvasRenderingContext2D {
  // Add any Node.js canvas-specific methods or properties here if needed
}

/**
 * A wrapper for browser canvas context that ensures compatibility with Node.js canvas
 */
export class CanvasAdapter {
  private ctx: BrowserCanvasRenderingContext2D;
  
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx as BrowserCanvasRenderingContext2D;
  }
  
  /**
   * Get the underlying canvas context
   */
  getContext(): BrowserCanvasRenderingContext2D {
    return this.ctx;
  }
  
  /**
   * Clear the canvas with the specified color
   */
  clear(color: string = 'white'): void {
    const { width, height } = this.ctx.canvas;
    this.ctx.save();
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, width, height);
    this.ctx.restore();
  }
  
  /**
   * Get the width of the canvas
   */
  getWidth(): number {
    return this.ctx.canvas.width;
  }
  
  /**
   * Get the height of the canvas
   */
  getHeight(): number {
    return this.ctx.canvas.height;
  }
  
  /**
   * Resize the canvas to the specified dimensions
   */
  resize(width: number, height: number): void {
    this.ctx.canvas.width = width;
    this.ctx.canvas.height = height;
  }
}

/**
 * AssetRenderer class that handles rendering assets to a browser canvas
 */
export class AssetRenderer {
  private canvas: HTMLCanvasElement;
  private adapter: CanvasAdapter;
  
  /**
   * Create a new AssetRenderer
   * @param canvas The HTML canvas element to render to
   */
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    this.adapter = new CanvasAdapter(ctx);
  }
  
  /**
   * Get the canvas adapter
   */
  getAdapter(): CanvasAdapter {
    return this.adapter;
  }
  
  /**
   * Get the canvas element
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }
  
  /**
   * Render an asset to the canvas
   * @param asset The asset to render
   * @param options Optional rendering options
   */
  renderAsset(asset: Asset, options?: any): void {
    const ctx = this.adapter.getContext();
    this.adapter.clear();
    
    // Center the asset on the canvas
    ctx.save();
    ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    
    // Render the asset
    asset.render(ctx, options);
    
    ctx.restore();
  }
  
  /**
   * Export the canvas content as a data URL
   */
  toDataURL(): string {
    return this.canvas.toDataURL();
  }
}

/**
 * AssetAdapter class that adapts an asset for browser use
 */
export class AssetAdapter<T extends Asset> {
  private asset: T;
  private renderer: AssetRenderer;
  private animationFrame: number | null = null;
  private isAnimating = false;
  private animationSpeed = 1.0;
  private lastFrameTime = 0;
  
  /**
   * Create a new AssetAdapter
   * @param asset The asset to adapt
   * @param renderer The renderer to use
   */
  constructor(asset: T, renderer: AssetRenderer) {
    this.asset = asset;
    this.renderer = renderer;
  }
  
  /**
   * Get the asset
   */
  getAsset(): T {
    return this.asset;
  }
  
  /**
   * Render the asset with the specified options
   * @param options Optional rendering options
   */
  render(options?: any): void {
    this.renderer.renderAsset(this.asset, options);
  }
  
  /**
   * Start the animation loop
   * @param renderCallback Function to call on each animation frame
   */
  startAnimation(renderCallback: (timestamp: number) => void): void {
    if (this.isAnimating) return;
    
    this.isAnimating = true;
    this.lastFrameTime = performance.now();
    
    const animate = (timestamp: number) => {
      if (!this.isAnimating) return;
      
      // Calculate delta time with animation speed factor
      const deltaTime = (timestamp - this.lastFrameTime) * this.animationSpeed;
      this.lastFrameTime = timestamp;
      
      // Call the render callback
      renderCallback(deltaTime);
      
      // Request the next frame
      this.animationFrame = requestAnimationFrame(animate);
    };
    
    this.animationFrame = requestAnimationFrame(animate);
  }
  
  /**
   * Stop the animation loop
   */
  stopAnimation(): void {
    if (!this.isAnimating || this.animationFrame === null) return;
    
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.isAnimating = false;
  }
  
  /**
   * Set the animation speed
   * @param speed The animation speed (1.0 = normal speed)
   */
  setAnimationSpeed(speed: number): void {
    this.animationSpeed = speed;
  }
  
  /**
   * Check if the animation is running
   */
  isAnimationRunning(): boolean {
    return this.isAnimating;
  }
  
  /**
   * Toggle the animation state
   * @returns The new animation state
   */
  toggleAnimation(): boolean {
    if (this.isAnimating) {
      this.stopAnimation();
    } else {
      this.startAnimation(() => {});
    }
    return this.isAnimating;
  }
}

/**
 * Create an asset adapter for the specified asset and canvas
 * @param asset The asset to adapt
 * @param canvas The canvas to render to
 * @returns An asset adapter
 */
export function createAssetAdapter<T extends Asset>(asset: T, canvas: HTMLCanvasElement): AssetAdapter<T> {
  const renderer = new AssetRenderer(canvas);
  return new AssetAdapter<T>(asset, renderer);
}

/**
 * Fix the import path for Node.js modules in the browser
 * This is used to handle the difference between Node.js and browser imports
 * @param path The import path to fix
 * @returns The fixed import path
 */
export function fixImportPath(path: string): string {
  // Remove .js extension for browser compatibility
  return path.replace(/\.js$/, '');
}