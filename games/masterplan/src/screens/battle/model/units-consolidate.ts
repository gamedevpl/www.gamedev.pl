import { Unit } from '../../designer/designer-types';

export function consolidateUnits(units: Unit[]): Unit[] {
  if (units.length === 0) return [];

  // Determine grid boundaries
  let minCol = Infinity,
    minRow = Infinity,
    maxCol = -Infinity,
    maxRow = -Infinity;

  units.forEach((unit) => {
    minCol = Math.min(minCol, unit.col);
    minRow = Math.min(minRow, unit.row);
    maxCol = Math.max(maxCol, unit.col + unit.sizeCol - 1);
    maxRow = Math.max(maxRow, unit.row + unit.sizeRow - 1);
  });

  const gridCols = maxCol - minCol + 1;
  const gridRows = maxRow - minRow + 1;

  // Initialize grid
  type Cell = {
    unit: Unit;
    processed: boolean;
  } | null;

  const grid: Cell[][] = Array.from({ length: gridRows }, () => Array(gridCols).fill(null));

  // Place units on the grid
  units.forEach((unit) => {
    for (let r = unit.row; r < unit.row + unit.sizeRow; r++) {
      for (let c = unit.col; c < unit.col + unit.sizeCol; c++) {
        const gridRow = r - minRow;
        const gridCol = c - minCol;
        if (grid[gridRow][gridCol] && grid[gridRow][gridCol]?.unit.id !== unit.id) {
          throw new Error('Units overlap on the grid.');
        }
        grid[gridRow][gridCol] = { unit, processed: false };
      }
    }
  });

  const consolidatedUnits: Unit[] = [];
  let newId = Math.max(...units.map((u) => u.id)) + 1;

  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const cell = grid[r][c];
      if (cell && !cell.processed) {
        const { unit } = cell;
        // Attempt to expand rectangle to the right
        let endCol = c;
        while (
          endCol + 1 < gridCols &&
          grid[r][endCol + 1]?.unit.type === unit.type &&
          grid[r][endCol + 1]?.unit.command === unit.command &&
          !grid[r][endCol + 1]?.processed
        ) {
          endCol++;
        }

        // Attempt to expand rectangle downwards
        let endRow = r;
        let canExpand = true;
        while (canExpand && endRow + 1 < gridRows) {
          for (let col = c; col <= endCol; col++) {
            const currentCell = grid[endRow + 1][col];
            if (
              !currentCell ||
              currentCell.unit.type !== unit.type ||
              currentCell.unit.command !== unit.command ||
              currentCell.processed
            ) {
              canExpand = false;
              break;
            }
          }
          if (canExpand) {
            endRow++;
          }
        }

        // Mark all cells in the rectangle as processed
        for (let row = r; row <= endRow; row++) {
          for (let col = c; col <= endCol; col++) {
            grid[row][col]!.processed = true;
          }
        }

        // Create the consolidated unit
        const consolidatedUnit: Unit = {
          id: newId++,
          col: c + minCol,
          row: r + minRow,
          sizeCol: endCol - c + 1,
          sizeRow: endRow - r + 1,
          type: unit.type,
          command: unit.command,
        };

        consolidatedUnits.push(consolidatedUnit);
      }
    }
  }

  return consolidatedUnits;
}
