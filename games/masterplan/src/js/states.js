import { DEBUG, NULL } from './consts.js';
import { EVENT_TIMEOUT, EVENT_BATTLE_START, EVENT_INTERVAL_100MS, EVENT_INTERVAL_SECOND } from './events.js';
import { stateGameBattleInit } from './states/state-game-battle.js';

/**
 * State machine
 */

Function.prototype.State = function () {
  return this;
};

var stateTimeout;
Function.prototype.WeakState = function (timeLimit) {
  var handler = this.State();

  if (stateTimeout) {
    clearTimeout(stateTimeout);
  }

  stateTimeout = setTimeout(function () {
    if (currentState === handler) {
      updateState(EVENT_TIMEOUT);
      stateTimeout = NULL;
    }
  }, timeLimit);

  return handler;
};

/**
 * Initial state
 * @constructor
 */
export function stateInit() {
  return function InitHandler(eventType, eventObject) {
    if (eventType == EVENT_BATTLE_START) {
      return new stateGameBattleInit(eventObject.units, eventObject.units);
    }
  }.State();
}

/**
 * Event processing
 */
let currentState = stateInit();
export function updateState(eventType, eventObject) {
  var nextState = currentState(eventType, eventObject);

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

setInterval(() => updateState(EVENT_INTERVAL_100MS), 100);
setInterval(() => updateState(EVENT_INTERVAL_SECOND), 1000);
