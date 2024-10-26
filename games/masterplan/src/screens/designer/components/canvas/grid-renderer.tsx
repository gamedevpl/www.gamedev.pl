import { GRID_CENTER_X, GRID_CENTER_Y } from '../../../battle/consts';

interface GridRenderProps {
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
}

export class GridRenderer {
  static render(ctx: CanvasRenderingContext2D, { width, height, cellWidth, cellHeight }: GridRenderProps): void {
    this.drawGridLines(ctx, width, height, cellWidth, cellHeight);
    this.drawCenterIndicator(ctx, cellWidth, cellHeight);
  }

  private static drawGridLines(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    cellWidth: number,
    cellHeight: number,
  ): void {
    ctx.save();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;

    // Draw vertical lines
    for (let x = 0; x <= width; x += cellWidth) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw horizontal lines
    for (let y = 0; y <= height; y += cellHeight) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  private static drawCenterIndicator(ctx: CanvasRenderingContext2D, cellWidth: number, cellHeight: number): void {
    const centerX = GRID_CENTER_X * cellWidth;
    const centerY = GRID_CENTER_Y * cellHeight;

    ctx.save();

    // Draw center cross
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - cellHeight / 2);
    ctx.lineTo(centerX, centerY + cellHeight / 2);
    ctx.stroke();

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(centerX - cellWidth / 2, centerY);
    ctx.lineTo(centerX + cellWidth / 2, centerY);
    ctx.stroke();

    // Draw center dot
    ctx.fillStyle = '#666';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Convert grid coordinates to canvas coordinates
   */
  static gridToCanvas(col: number, row: number, cellWidth: number, cellHeight: number): { x: number; y: number } {
    return {
      x: (col + GRID_CENTER_X) * cellWidth,
      y: (row + GRID_CENTER_Y) * cellHeight,
    };
  }

  /**
   * Convert canvas coordinates to grid coordinates
   */
  static canvasToGrid(x: number, y: number, cellWidth: number, cellHeight: number): { col: number; row: number } {
    return {
      col: Math.floor(x / cellWidth) - GRID_CENTER_X,
      row: Math.floor(y / cellHeight) - GRID_CENTER_Y,
    };
  }
}
