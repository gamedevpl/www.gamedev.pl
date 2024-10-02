import { Unit } from '../designer-screen';

interface Position {
  x: number;
  y: number;
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
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

export function isUnitNearEdge(unit: Unit, containerRect: Rect, cellWidth: number, cellHeight: number): boolean {
  const unitLeft = unit.col * cellWidth;
  const unitTop = unit.row * cellHeight;
  const unitRight = (unit.col + unit.sizeCol) * cellWidth;
  const unitBottom = (unit.row + unit.sizeRow) * cellHeight;

  const edgeThreshold = 50; // pixels

  return (
    unitLeft < edgeThreshold ||
    unitTop < edgeThreshold ||
    containerRect.width - unitRight < edgeThreshold ||
    containerRect.height - unitBottom < edgeThreshold
  );
}

export function getOppositePosition(unit: Unit, containerRect: Rect, cellWidth: number, cellHeight: number): Position {
  const unitCenterX = (unit.col + unit.sizeCol / 2) * cellWidth;
  const unitCenterY = (unit.row + unit.sizeRow / 2) * cellHeight;

  let x = unitCenterX + containerRect.left;
  let y = unitCenterY + containerRect.top;

  // If the unit is on the right side of the screen, place the panel on the left
  if (x > containerRect.width / 2) {
    x = unitCenterX - PANEL_WIDTH - MARGIN + containerRect.left;
  } else {
    x = unitCenterX + MARGIN + containerRect.left;
  }

  // If the unit is on the bottom half of the screen, place the panel above
  if (y > containerRect.height / 2) {
    y = unitCenterY - PANEL_HEIGHT - MARGIN + containerRect.top;
  } else {
    y = unitCenterY + MARGIN + containerRect.top;
  }

  return { x, y };
}
