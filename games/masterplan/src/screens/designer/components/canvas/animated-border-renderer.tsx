import { Unit } from '../../designer-types';
import { GridRenderer } from './grid-renderer';

interface AnimatedBorderRenderProps {
  units: Unit[];
  selectedUnitId: number | null;
  cellWidth: number;
  cellHeight: number;
  timestamp: number;
}

export class AnimatedBorderRenderer {
  private static readonly DASH_LENGTH = 5;
  private static readonly DASH_GAP = 3;
  private static readonly ANIMATION_SPEED = 50; // Lower = faster
  private static readonly BORDER_WIDTH = 2;
  private static readonly SELECTED_COLOR = '#FFFFFF';
  private static readonly UNSELECTED_COLOR = '#FFD700';

  static render(ctx: CanvasRenderingContext2D, props: AnimatedBorderRenderProps): void {
    const { units, selectedUnitId, cellWidth, cellHeight, timestamp } = props;

    units.forEach((unit) => {
      this.renderBorder(ctx, {
        unit,
        isSelected: unit.id === selectedUnitId,
        cellWidth,
        cellHeight,
        timestamp,
      });
    });
  }

  private static renderBorder(
    ctx: CanvasRenderingContext2D,
    props: {
      unit: Unit;
      isSelected: boolean;
      cellWidth: number;
      cellHeight: number;
      timestamp: number;
    },
  ): void {
    const { unit, isSelected, cellWidth, cellHeight, timestamp } = props;
    const { x, y } = GridRenderer.gridToCanvas(unit.col, unit.row, cellWidth, cellHeight);
    const width = unit.sizeCol * cellWidth;
    const height = unit.sizeRow * cellHeight;

    ctx.save();

    // Set up the animated dotted line pattern
    const dashOffset = (timestamp / this.ANIMATION_SPEED) % (this.DASH_LENGTH + this.DASH_GAP);

    ctx.strokeStyle = isSelected ? this.SELECTED_COLOR : this.UNSELECTED_COLOR;
    ctx.lineWidth = this.BORDER_WIDTH;
    ctx.setLineDash([this.DASH_LENGTH, this.DASH_GAP]);
    ctx.lineDashOffset = -dashOffset;

    // Draw the main border
    ctx.strokeRect(x, y, width, height);

    // Add glow effect for selected units
    if (isSelected) {
      this.renderGlowEffect(ctx, { x, y, width, height });
    }

    // Add corner indicators
    this.renderCornerIndicators(ctx, { x, y, width, height, isSelected });

    ctx.restore();
  }

  private static renderGlowEffect(
    ctx: CanvasRenderingContext2D,
    props: {
      x: number;
      y: number;
      width: number;
      height: number;
    },
  ): void {
    const { x, y, width, height } = props;

    ctx.save();

    // Create outer glow
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 4;
    ctx.setLineDash([]); // Solid line for glow
    ctx.strokeRect(x - 1, y - 1, width + 2, height + 2);

    // Create inner glow
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 0.5, y - 0.5, width + 1, height + 1);

    ctx.restore();
  }

  private static renderCornerIndicators(
    ctx: CanvasRenderingContext2D,
    props: {
      x: number;
      y: number;
      width: number;
      height: number;
      isSelected: boolean;
    },
  ): void {
    const { x, y, width, height, isSelected } = props;
    const cornerSize = 4;

    ctx.save();

    // Reset dash pattern for solid corners
    ctx.setLineDash([]);
    ctx.lineWidth = isSelected ? 3 : 2;

    // Top-left corner
    this.drawCorner(ctx, x, y, cornerSize, 0, 0);
    // Top-right corner
    this.drawCorner(ctx, x + width, y, cornerSize, -1, 0);
    // Bottom-left corner
    this.drawCorner(ctx, x, y + height, cornerSize, 0, -1);
    // Bottom-right corner
    this.drawCorner(ctx, x + width, y + height, cornerSize, -1, -1);

    ctx.restore();
  }

  private static drawCorner(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    xDir: number,
    yDir: number,
  ): void {
    ctx.beginPath();
    // Horizontal line
    ctx.moveTo(x, y);
    ctx.lineTo(x + size * (xDir || 1), y);
    // Vertical line
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + size * (yDir || 1));
    ctx.stroke();
  }
}
