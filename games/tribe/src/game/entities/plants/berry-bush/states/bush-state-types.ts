import { BaseStateData } from "../../../../state-machine/state-machine-types";

export const BUSH_GROWING = "bushGrowing";
export const BUSH_FULL = "bushFull";
export const BUSH_SPREADING = "bushSpreading";
export const BUSH_DYING = "bushDying";

export interface BushGrowingStateData extends BaseStateData {}
export interface BushFullStateData extends BaseStateData {}
export interface BushSpreadingStateData extends BaseStateData {}
export interface BushDyingStateData extends BaseStateData {}

export type BerryBushStateData =
  | BushGrowingStateData
  | BushFullStateData
  | BushSpreadingStateData
  | BushDyingStateData;
