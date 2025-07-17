import { StateData } from '../../../../state-machine/state-machine-types';

export const BUSH_GROWING = 'bushGrowing';
export const BUSH_FULL = 'bushFull';
export const BUSH_SPREADING = 'bushSpreading';
export const BUSH_DYING = 'bushDying';

export interface BushGrowingStateData extends StateData {
  state: 'growing'; // Explicitly define state for clarity
}
export interface BushFullStateData extends StateData {
  state: 'full';
}
export interface BushSpreadingStateData extends StateData {
  state: 'spreading';
}
export interface BushDyingStateData extends StateData {
  state: 'dying';
}
