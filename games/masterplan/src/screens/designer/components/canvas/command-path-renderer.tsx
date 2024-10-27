import { Unit, UnitType } from '../../designer-types';
import { UnitRenderer } from './unit-renderer';

interface CommandPathRenderProps {
  units: Unit[];
  unitImages: Record<string, HTMLImageElement>;
  cellWidth: number;
  cellHeight: number;
  isPlayerArea: boolean;
  worldTime: number;
}

export class CommandPathRenderer {
  private static readonly WAVE_DURATION: Record<UnitType, number> = // Duration of one wave animation in milliseconds
    {
      archer: 10000,
      artillery: 60000,
      tank: 20000,
      warrior: 5000,
    };
  private static readonly WAVE_STEPS = 10; // Number of fading copies to show
  private static readonly FLANK_DISTANCE = 20; // Distance for flanking movement (matches the command implementation)

  static render(ctx: CanvasRenderingContext2D, props: CommandPathRenderProps): void {
    const { units, worldTime, isPlayerArea } = props;

    if (!isPlayerArea) {
      // Only render command paths for player units
      return;
    }

    units.forEach((unit) => {
      if (unit.command) {
        // Calculate wave progress (0 to 1) based on world time
        const waveProgress = (worldTime % this.WAVE_DURATION[unit.type]) / this.WAVE_DURATION[unit.type];

        this.renderCommandPath(ctx, unit, waveProgress, props);
      }
    });
  }

  private static renderCommandPath(
    ctx: CanvasRenderingContext2D,
    unit: Unit,
    waveProgress: number,
    props: CommandPathRenderProps,
  ): void {
    const { cellWidth, cellHeight, unitImages, isPlayerArea } = props;

    let step = Math.floor(waveProgress * this.WAVE_STEPS * 5) / 5;

    if ('wait-advance' === unit.command && step < 3) {
      // Skip the first two steps for wait-advance
      return;
    } else if ('wait-advance' === unit.command && step >= 3) {
      // Adjust step for wait-advance
      step -= 2;
    }

    // Calculate positions for each step of the wave
    const stepProgress = step / this.WAVE_STEPS;
    const position = this.calculateStepPosition(unit, stepProgress);

    // Skip if the wave hasn't reached this step yet
    if (stepProgress < 0) return;

    // Calculate alpha based on step (fade out as steps increase)
    const alpha = Math.max(0, 1 - step / this.WAVE_STEPS - stepProgress);
    if (alpha <= 0) return;

    // Render fading unit copy
    ctx.save();
    ctx.globalAlpha = alpha;

    const ghostUnit: Unit = {
      ...unit,
      col: position.col,
      row: position.row,
    };

    UnitRenderer.renderUnit(ctx, ghostUnit, unitImages, cellWidth, cellHeight, isPlayerArea);
    ctx.restore();
  }

  private static calculateStepPosition(unit: Unit, progress: number): { col: number; row: number } {
    const startPos = { col: unit.col, row: unit.row };
    let endPos = { ...startPos };

    switch (unit.command) {
      case 'flank-left': {
        // Move forward and to the left
        const forwardDist = this.FLANK_DISTANCE * 0.5 * progress;
        const leftDist = this.FLANK_DISTANCE * progress;
        endPos = {
          col: startPos.col - leftDist,
          row: startPos.row - forwardDist,
        };
        break;
      }
      case 'flank-right': {
        // Move forward and to the right
        const forwardDist = this.FLANK_DISTANCE * 0.5 * progress;
        const rightDist = this.FLANK_DISTANCE * progress;
        endPos = {
          col: startPos.col + rightDist,
          row: startPos.row - forwardDist,
        };
        break;
      }
      case 'advance':
      case 'advance-wait':
      case 'wait-advance': {
        // Move forward
        const forwardDist = this.FLANK_DISTANCE * progress;
        endPos = {
          col: startPos.col,
          row: startPos.row - forwardDist,
        };
        break;
      }
    }

    return endPos;
  }
}
