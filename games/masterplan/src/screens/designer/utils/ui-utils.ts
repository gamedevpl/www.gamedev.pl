import { Unit } from '../designer-types';

interface Position {
  x: number;
  y: number;
}

const PANEL_WIDTH = 100; // Estimated width of the panel
const PANEL_HEIGHT = 50; // Estimated height of the panel
const MARGIN = 10; // Margin from the edges of the screen

export function calculatePanelPosition(
  unit: Unit,
  canvas: HTMLCanvasElement,
  cellWidth: number,
  cellHeight: number,
): Position {
  const rect = canvas.getBoundingClientRect();

  const unitCenterX = ((unit.col + unit.sizeCol / 2) * cellWidth) / (canvas.width / rect.width);
  const unitCenterY = ((unit.row + unit.sizeRow) * cellHeight) / (canvas.height / rect.height);

  let x = unitCenterX + rect.left + rect.width / 2;
  let y = unitCenterY + rect.top + rect.height / 2;

  // Adjust horizontal position
  if (x + PANEL_WIDTH + MARGIN > rect.right) {
    x = unitCenterX - PANEL_WIDTH + rect.left;
  }

  // Adjust vertical position
  if (y + PANEL_HEIGHT + MARGIN > rect.bottom) {
    y = unitCenterY - PANEL_HEIGHT + rect.top + rect.height / 2;
  }

  // Ensure the panel stays within the container bounds
  x = Math.max(rect.left + MARGIN, Math.min(x, rect.right - PANEL_WIDTH - MARGIN));
  y = Math.max(rect.top + MARGIN, Math.min(y, rect.bottom - PANEL_HEIGHT - MARGIN));

  return { x, y };
}
