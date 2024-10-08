import { Unit, UnitType } from '../../designer/designer-types';
import { MAX_COL, MAX_ROW } from '../consts';
import { CELL_INDEX_MAP, INPUT_COLS, INPUT_ROWS, ModelInput, ModelInputCell } from './types';

export function unitsToModelInput(units: Unit[]): ModelInput {
  const cols = INPUT_COLS;
  const rows = INPUT_ROWS;
  const data = Array.from({ length: rows }, () => Array.from({ length: cols }, () => [0, 0, 0, 0] as ModelInputCell));

  for (const u of units) {
    for (let i = 0; i < u.sizeRow; i++) {
      for (let j = 0; j < u.sizeCol; j++) {
        const gameRow = MAX_ROW / 2 + u.row + i;
        const gameCol = MAX_COL / 2 + u.col + j;
        const inputRow = Math.min(Math.floor((gameRow * rows) / MAX_ROW), INPUT_ROWS);
        const inputCol = Math.min(Math.floor((gameCol * cols) / MAX_COL), INPUT_COLS);
        if (data[inputRow]) {
          data[inputRow][inputCol][CELL_INDEX_MAP[u.type]] = 1;
        }
      }
    }
  }

  return { cols, rows, data };
}

export function modelInputToUnits(input: ModelInput): Unit[] {
  const units: Unit[] = [];

  for (let i = 0; i < input.rows; i++) {
    for (let j = 0; j < input.cols; j++) {
      if (input.data[i][j].some((v) => v > 0)) {
        const gameRow = ((i + 0.5) * MAX_ROW) / input.rows;
        const gameCol = ((j + 0.5) * MAX_COL) / input.cols;
        const u_row = Math.floor(gameRow - MAX_ROW / 2);
        const u_col = Math.floor(gameCol - MAX_COL / 2);
        const type = Object.keys(CELL_INDEX_MAP)
          .map((k) => [k, input.data[i][j][CELL_INDEX_MAP[k as UnitType]]] as const)
          .sort((a, b) => b[1] - a[1])[0][0] as UnitType;

        units.push({
          id: units.length,
          col: u_col,
          row: u_row,
          sizeCol: 1,
          sizeRow: 1,
          type,
          command: 'attack',
        });
      }
    }
  }

  return units;
}
