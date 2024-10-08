import { MAX_COL, MAX_ROW } from '../consts';

export type ModelInputCell = [tank: number, warrior: number, archer: number, artillery: number];

export const CELL_INDEX_MAP = { tank: 0, warrior: 1, archer: 2, artillery: 3 } as const;

export type ModelInput = {
  cols: number;
  rows: number;
  data: ModelInputCell[][];
};

export const INPUT_COLS = 20;
export const INPUT_ROWS = Math.floor(INPUT_COLS / (MAX_COL / MAX_ROW));
