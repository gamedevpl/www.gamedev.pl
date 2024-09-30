import { loadBattleString } from './battle-string.js';
import { DEBUG, NULL } from './consts.js';
import { EVENT_TIMEOUT, EVENT_READYSTATE, EVENT_INTERVAL_100MS, EVENT_INTERVAL_SECOND } from './events.js';
import { stateGameDesigner } from './states/state-game-designer.js';

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
    if (eventType == EVENT_READYSTATE && eventObject == 'complete') {
      // styles
      var style = document.createElement('style');
      document.head.appendChild(style);
      var sheet = style.sheet;
      ['warrior', 'archer', 'tank', 'artillery'].forEach((type, idx) => {
        var img = document.getElementById('asset-soldier-' + type);
        sheet.insertRule(
          `.field-unit[data-unit-type=${type}] {
                    background: url(${img.src});
                }`,
          idx,
        );
      });

      if (location.hash.indexOf('#vs=') === 0) {
        try {
          return new stateGameDesigner(null, loadBattleString(null, location.hash.substr(4)));
        } catch {
          alert('Blue print invalid!');
        }
      }

      return new stateGameDesigner();
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
