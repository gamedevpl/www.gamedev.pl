import { rotateUnits, Unit, UnitType } from '../../designer/designer-types';
import { MAX_COL, MAX_ROW } from '../consts';
import { CELL_INDEX_MAP, COMMAND_INDEX_MAP, INPUT_COLS, INPUT_ROWS, ModelInput, ModelInputCell } from './types';

export function unitsToModelInput(units: Unit[]): ModelInput {
  const cols = INPUT_COLS;
  const rows = INPUT_ROWS;
  const data = Array.from({ length: rows }, () =>
    Array.from(
      { length: cols },
      () => Array(Object.keys(CELL_INDEX_MAP).length + Object.keys(COMMAND_INDEX_MAP).length).fill(0) as ModelInputCell,
    ),
  );

  let maxUnitCount = 0;

  for (const u of units) {
    for (let i = 0; i < u.sizeRow; i++) {
      for (let j = 0; j < u.sizeCol; j++) {
        const gameRow = MAX_ROW / 2 + u.row + i;
        const gameCol = MAX_COL / 2 + u.col + j;
        const inputRow = Math.min(Math.floor((gameRow * rows) / MAX_ROW), INPUT_ROWS - 1);
        const inputCol = Math.min(Math.floor((gameCol * cols) / MAX_COL), INPUT_COLS - 1);
        if (data[inputRow] && data[inputRow][inputCol]) {
          data[inputRow][inputCol][CELL_INDEX_MAP[u.type]] =
            1 + (data[inputRow][inputCol][CELL_INDEX_MAP[u.type]] || 0);
          maxUnitCount = Math.max(maxUnitCount, data[inputRow][inputCol][CELL_INDEX_MAP[u.type]]);
          if (u.command && COMMAND_INDEX_MAP[u.command]) {
            data[inputRow][inputCol][COMMAND_INDEX_MAP[u.command]] = 1;
          }
        }
      }
    }
  }

  // Normalize unit counts using maxUnitCount
  for (const row of data) {
    for (const cell of row) {
      for (const key in CELL_INDEX_MAP) {
        cell[CELL_INDEX_MAP[key as UnitType]] = cell[CELL_INDEX_MAP[key as UnitType]] / maxUnitCount;
      }
    }
  }

  return { cols, rows, data };
}

export function modelInputToUnits(input: ModelInput): Unit[] {
  const units: Unit[] = [];

  const inputMap: Record<string, { type: UnitType; command?: Unit['command'] }> = {};

  for (let i = 0; i < input.rows; i++) {
    for (let j = 0; j < input.cols; j++) {
      if (input.data[i][j].some((v) => v > 0)) {
        const type = Object.keys(CELL_INDEX_MAP)
          .map((k) => [k, input.data[i][j][CELL_INDEX_MAP[k as UnitType]]] as const)
          .sort((a, b) => b[1] - a[1])
          .filter((cell) => cell[1] > 0.1)?.[0]?.[0] as UnitType | undefined;

        const command = Object.keys(COMMAND_INDEX_MAP)
          .map((k) => [k, input.data[i][j][COMMAND_INDEX_MAP[k as Unit['command']]]] as const)
          .sort((a, b) => b[1] - a[1])
          .filter((cell) => cell[1] > 0.1)?.[0]?.[0] as Unit['command'] | undefined;

        if (type) {
          inputMap[i + ',' + j] = { type, command };
        }
      }
    }
  }

  for (let x = 0; x < MAX_COL; x++) {
    for (let y = 0; y < MAX_ROW; y++) {
      const inputRow = Math.min(Math.floor((y * input.rows) / MAX_ROW), INPUT_ROWS - 1);
      const inputCol = Math.min(Math.floor((x * input.cols) / MAX_COL), INPUT_COLS - 1);
      const unitData = inputMap[inputRow + ',' + inputCol];
      if (unitData) {
        units.push({
          id: units.length + 1,
          col: x - MAX_COL / 2,
          row: y - MAX_ROW / 2,
          sizeCol: 1,
          sizeRow: 1,
          type: unitData.type,
          command: unitData.command || 'advance',
        });
      }
    }
  }

  return rotateUnits(units);
}
