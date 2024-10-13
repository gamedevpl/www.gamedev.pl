import { Unit } from '../designer/designer-types';
import { DEBUG } from './consts';
import { EVENT_BATTLE_START } from './events';
import { TerrainData } from './game/terrain/terrain-generator';
import { stateGameBattleInit } from './states/state-game-battle';

/**
 * Initial state
 * @constructor
 */
export function stateInit() {
  return function InitHandler(
    eventType: number,
    eventObject: { playerUnits: Unit[]; oppositionUnits: Unit[]; terrainData: TerrainData },
  ) {
    if (eventType == EVENT_BATTLE_START) {
      return stateGameBattleInit(eventObject.playerUnits, eventObject.oppositionUnits, eventObject.terrainData);
    }
  };
}

type StateHandler<T = unknown> = (eventType: number, eventObject: T) => StateHandler<unknown> | undefined;

/**
 * Event processing
 */
let currentState: StateHandler;

export function initCurrentState() {
  currentState = stateInit() as StateHandler;
}

export function updateState(eventType: number, eventObject?: unknown) {
  const nextState = currentState(eventType, eventObject);

  if (!nextState) {
    return;
  }

  if (nextState !== currentState) {
    if (DEBUG) {
      console.log('Transition from ' + currentState.name + ' to ' + nextState.name);
    }

    currentState = nextState;
  }
}
