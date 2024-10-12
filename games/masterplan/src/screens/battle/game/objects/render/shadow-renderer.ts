// shadow-renderer.ts

import { Canvas } from '../../../util/canvas';
import { SoldierObject } from '../object-soldier';

interface ShadowOptions {
  opacity: number;
}

export class ShadowRenderer {
  private defaultOptions: ShadowOptions = {
    opacity: 0.3,
  };

  private options: ShadowOptions = { ...this.defaultOptions };

  constructor(options: Partial<ShadowOptions> = {}) {
    this.options = { ...this.defaultOptions, ...options };
  }

  /**
   * Renders a shadow for a soldier object.
   * @param canvas The canvas to render on.
   * @param soldier The soldier object to render the shadow for.
   */
  render(canvas: Canvas, soldier: SoldierObject): void {
    const ctx = canvas.getCtx();
    const { opacity } = this.options;

    ctx.save();

    ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;

    // Determine shadow shape based on soldier state
    if (soldier.state.isAlive()) {
      this.renderUprightShadow(ctx, soldier);
    } else {
      this.renderFallenShadow(ctx, soldier);
    }

    ctx.restore();
  }

  private renderUprightShadow(ctx: CanvasRenderingContext2D, soldier: SoldierObject): void {
    const shadowRadius = soldier.getWidth() / 2;
    const shadowX = 0;
    const shadowY = soldier.getHeight() / 2 + 2; // Slightly below the soldier

    ctx.beginPath();
    ctx.ellipse(shadowX, shadowY, shadowRadius, shadowRadius / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderFallenShadow(ctx: CanvasRenderingContext2D, soldier: SoldierObject): void {
    const shadowWidth = soldier.getHeight() * 0.8; // Adjust as needed
    const shadowHeight = soldier.getWidth() * 0.4; // Adjust as needed
    const shadowX = 0;
    const shadowY = soldier.getHeight() / 2 + 2; // Slightly below the soldier

    ctx.beginPath();
    ctx.ellipse(shadowX, shadowY, shadowWidth / 2, shadowHeight / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * A utility function to render a shadow for a soldier object using default options.
 * @param canvas The canvas to render on.
 * @param soldier The soldier object to render the shadow for.
 */
export function renderShadow(canvas: Canvas, soldier: SoldierObject): void {
  const shadowRenderer = new ShadowRenderer();
  shadowRenderer.render(canvas, soldier);
}
