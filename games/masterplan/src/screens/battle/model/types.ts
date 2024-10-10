import { MAX_COL, MAX_ROW } from '../consts';

export type ModelInputCell = [
  tank: number,
  warrior: number,
  archer: number,
  artillery: number,
  advanceWait: number,
  advance: number,
  waitAdvance: number,
  flankLeft: number,
  flankRight: number
];

export const CELL_INDEX_MAP = { tank: 0, warrior: 1, archer: 2, artillery: 3 } as const;

export const COMMAND_INDEX_MAP = {
  'advance-wait': 4,
  'advance': 5,
  'wait-advance': 6,
  'flank-left': 7,
  'flank-right': 8
} as const;

export type ModelInput = {
  cols: number;
  rows: number;
  data: ModelInputCell[][];
};

export const INPUT_COLS = 30;
export const INPUT_ROWS = Math.floor(INPUT_COLS / (MAX_COL / MAX_ROW));