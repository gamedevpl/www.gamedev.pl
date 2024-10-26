import { MAX_COL, MAX_ROW } from '../../battle/consts';
import { Unit } from '../designer-types';

interface Position {
  x: number;
  y: number;
}

export interface PanelDimensions {
  width: number;
  height: number;
  expandedOptionsHeight?: number;
}

const MARGIN = 20; // Margin from the edges of the screen

/**
 * Calculates the panel position based on unit's location on screen:
 * - If unit is on the left half of the screen, panel appears on right bottom
 * - If unit is on the right half of the screen, panel appears on left bottom
 */
export function calculatePanelPosition(
  unit: Unit,
  canvas: HTMLCanvasElement,
  cellWidth: number,
  cellHeight: number,
  panelDimensions: PanelDimensions,
): Position {
  const rect = canvas.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const scale = viewportWidth > viewportHeight ? rect.width / canvas.width : rect.height / canvas.height;

  // Calculate unit center position in screen coordinates
  const unitCenterX = (unit.col + MAX_COL / 2 + unit.sizeCol / 2) * cellWidth * scale;
  const unitCenterY = (unit.row + MAX_ROW / 2 + unit.sizeRow / 2) * cellHeight * scale;
  const screenX = rect.left + unitCenterX;
  const screenY = rect.top + unitCenterY;

  // Determine if unit is on the left or right half of the screen
  const isUnitOnLeftHalf = screenX < viewportWidth / 2;
  const isUnitOnAboveHalf = screenY < viewportHeight / 2;

  // Calculate x position based on which half the unit is on
  const x = !isUnitOnLeftHalf
    ? screenX + (unit.sizeCol / 2) * cellWidth * scale + MARGIN // Right side
    : screenX - (unit.sizeCol / 2) * cellWidth * scale - panelDimensions.width - MARGIN; // Left side

  // Calculate y position at bottom with margin)
  const y = !isUnitOnAboveHalf
    ? screenY + panelDimensions.height // Below
    : screenY - panelDimensions.height; // Above

  return {
    x: Math.max(MARGIN, Math.min(x, viewportWidth - panelDimensions.width - MARGIN)),
    y: Math.max(MARGIN, Math.min(y, viewportHeight - panelDimensions.height - MARGIN)),
  };
}
