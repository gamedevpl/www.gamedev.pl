import { MAX_COL, MAX_ROW } from '../consts';

export type ModelInputCell = [tank: number, warrior: number, archer: number, artillery: number, terrainHeight: number];

export type ModelOutputCell = [
  tank: number,
  warrior: number,
  archer: number,
  artillery: number,
  advanceWait: number,
  advance: number,
  waitAdvance: number,
  flankLeft: number,
  flankRight: number,
];

export const INPUT_CELL_UNIT_INDEX_MAP = {
  tank: 0,
  warrior: 1,
  archer: 2,
  artillery: 3,
} as const;

export const INPUT_CELL_INDEX_MAP = {
  ...INPUT_CELL_UNIT_INDEX_MAP,
  terrainHeight: 4,
} as const;

export const OUTPUT_CELL_UNIT_INDEX_MAP = {
  tank: 0,
  warrior: 1,
  archer: 2,
  artillery: 3,
} as const;

export const OUTPUT_CELL_COMMAND_INDEX_MAP = {
  'advance-wait': 4,
  advance: 5,
  'wait-advance': 6,
  'flank-left': 7,
  'flank-right': 8,
} as const;

export const OUTPUT_CELL_INDEX_MAP = {
  ...OUTPUT_CELL_UNIT_INDEX_MAP,
  ...OUTPUT_CELL_COMMAND_INDEX_MAP,
} as const;

export interface ModelInput {
  cols: number;
  rows: number;
  data: ModelInputCell[][];
}

export interface ModelOutput {
  cols: number;
  rows: number;
  data: ModelOutputCell[][];
}

export const INPUT_SHAPE = Object.keys(INPUT_CELL_INDEX_MAP).length;
export const OUTPUT_SHAPE = Object.keys(OUTPUT_CELL_INDEX_MAP).length;

export const INPUT_COLS = 30;
export const INPUT_ROWS = Math.floor(INPUT_COLS / (MAX_COL / MAX_ROW));
