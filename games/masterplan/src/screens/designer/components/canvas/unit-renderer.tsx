import { Unit } from '../../designer-types';
import { GridRenderer } from './grid-renderer';
import { CommandPathRenderer } from './command-path-renderer';

interface UnitRenderProps {
  units: Unit[];
  unitImages: Record<string, HTMLImageElement>;
  cellWidth: number;
  cellHeight: number;
  isPlayerArea: boolean;
  worldTime: number; // Added worldTime for animation
}

export class UnitRenderer {
  static render(ctx: CanvasRenderingContext2D, props: UnitRenderProps): void {
    const { units, unitImages, cellWidth, cellHeight, isPlayerArea, worldTime } = props;

    // First render command paths (they should appear behind the units)
    CommandPathRenderer.render(ctx, {
      units,
      unitImages,
      cellWidth,
      cellHeight,
      isPlayerArea,
      worldTime,
    });

    // Then render the actual units on top
    units.forEach((unit) => {
      this.renderUnit(ctx, unit, unitImages, cellWidth, cellHeight, isPlayerArea);
    });
  }

  static renderUnit(
    ctx: CanvasRenderingContext2D,
    unit: Unit,
    unitImages: Record<string, HTMLImageElement>,
    cellWidth: number,
    cellHeight: number,
    isPlayerArea: boolean,
  ): void {
    const { x, y } = GridRenderer.gridToCanvas(unit.col, unit.row, cellWidth, cellHeight);
    const unitWidth = unit.sizeCol * cellWidth;
    const unitHeight = unit.sizeRow * cellHeight;

    if (unitImages[unit.type]) {
      this.renderUnitWithImage(ctx, {
        unit,
        image: unitImages[unit.type],
        x,
        y,
        cellWidth,
        cellHeight,
        isPlayerArea,
      });
    } else {
      this.renderUnitFallback(ctx, {
        unit,
        x,
        y,
        unitWidth,
        unitHeight,
      });
    }

    // Draw unit type text
    this.renderUnitLabel(ctx, {
      unit,
      x,
      y,
      unitWidth,
      unitHeight,
    });
  }

  private static renderUnitWithImage(
    ctx: CanvasRenderingContext2D,
    props: {
      unit: Unit;
      image: HTMLImageElement;
      x: number;
      y: number;
      cellWidth: number;
      cellHeight: number;
      isPlayerArea: boolean;
    },
  ): void {
    const { unit, image, x, y, cellWidth, cellHeight, isPlayerArea } = props;

    ctx.save();
    for (let xi = 0; xi < unit.sizeCol; xi++) {
      for (let yi = 0; yi < unit.sizeRow; yi++) {
        // Draw unit image
        ctx.drawImage(image, x + xi * cellWidth, y + yi * cellHeight, cellWidth, cellHeight);

        // Draw health indicator
        this.renderHealthIndicator(ctx, {
          x: x + xi * cellWidth,
          y: y + yi * cellHeight,
          width: 10,
          height: 5,
          isPlayerArea,
        });
      }
    }
    ctx.restore();
  }

  private static renderUnitFallback(
    ctx: CanvasRenderingContext2D,
    props: {
      unit: Unit;
      x: number;
      y: number;
      unitWidth: number;
      unitHeight: number;
    },
  ): void {
    const { unit, x, y, unitWidth, unitHeight } = props;

    ctx.save();
    // Fallback to colored rectangle if image is not loaded
    ctx.fillStyle = this.getUnitColor(unit.type);
    ctx.fillRect(x, y, unitWidth, unitHeight);
    ctx.restore();
  }

  private static renderHealthIndicator(
    ctx: CanvasRenderingContext2D,
    props: {
      x: number;
      y: number;
      width: number;
      height: number;
      isPlayerArea: boolean;
    },
  ): void {
    const { x, y, width, height, isPlayerArea } = props;

    ctx.save();
    ctx.fillStyle = isPlayerArea ? '#ff0000' : '#00ff00';
    ctx.fillRect(x, y + 10, width, height);
    ctx.restore();
  }

  private static renderUnitLabel(
    ctx: CanvasRenderingContext2D,
    props: {
      unit: Unit;
      x: number;
      y: number;
      unitWidth: number;
      unitHeight: number;
    },
  ): void {
    const { unit, x, y, unitWidth, unitHeight } = props;

    ctx.save();
    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(unit.type, x + unitWidth / 2, y + unitHeight / 2);
    ctx.restore();
  }

  private static getUnitColor(unitType: string): string {
    switch (unitType) {
      case 'archer':
        return 'green';
      case 'tank':
        return 'blue';
      default:
        return 'red';
    }
  }
}
