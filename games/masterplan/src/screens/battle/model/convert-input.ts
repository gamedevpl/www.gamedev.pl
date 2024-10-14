import { Unit, UnitType } from '../../designer/designer-types';
import { MAX_COL, MAX_ROW } from '../consts';
import { TerrainData } from '../game/terrain/terrain-generator';
import {
  INPUT_CELL_INDEX_MAP,
  INPUT_CELL_UNIT_INDEX_MAP,
  INPUT_COLS,
  INPUT_ROWS,
  ModelInput,
  ModelInputCell,
} from './types';

export function unitsToModelInput(units: Unit[], terrainData: TerrainData): ModelInput {
  const cols = INPUT_COLS;
  const rows = INPUT_ROWS;
  const data = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => Array(Object.keys(INPUT_CELL_INDEX_MAP).length).fill(0) as ModelInputCell),
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
          data[inputRow][inputCol][INPUT_CELL_INDEX_MAP[u.type]] =
            1 + (data[inputRow][inputCol][INPUT_CELL_INDEX_MAP[u.type]] || 0);
          maxUnitCount = Math.max(maxUnitCount, data[inputRow][inputCol][INPUT_CELL_INDEX_MAP[u.type]]);
        }
      }
    }
  }

  const maxHeight = Math.max(...terrainData.heightMap.flat());

  // Add terrain height to the input
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const gameRow = Math.floor((row * MAX_ROW) / rows);
      const gameCol = Math.floor((col * MAX_COL) / cols);
      const height = terrainData.heightMap[gameRow][gameCol];
      data[row][col][INPUT_CELL_INDEX_MAP.terrainHeight] = height / maxHeight;
    }
  }

  // Normalize unit counts using maxUnitCount
  for (const row of data) {
    for (const cell of row) {
      for (const key in INPUT_CELL_UNIT_INDEX_MAP) {
        cell[INPUT_CELL_UNIT_INDEX_MAP[key as UnitType]] =
          cell[INPUT_CELL_UNIT_INDEX_MAP[key as UnitType]] / maxUnitCount;
      }
    }
  }

  return { cols, rows, data };
}
