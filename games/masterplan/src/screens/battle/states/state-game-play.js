import { renderGame } from '../game/game-render.js';
import {
  EVENT_RAF,
  EVENT_ARROW_LEFT_DOWN,
  EVENT_ARROW_RIGHT_DOWN,
  EVENT_ARROW_UP_DOWN,
  EVENT_ARROW_DOWN_DOWN,
  EVENT_ARROW_LEFT_UP,
  EVENT_ARROW_RIGHT_UP,
  EVENT_RACE_OVER,
  EVENT_ESCAPE,
  EVENT_DOCUMENT_HIDDEN,
  EVENT_ARROW_DOWN_UP,
} from '../events.js';
import { stateGamePause } from './state-game-pause.js';
import { stateIntro } from './state-intro.js';
import { stateGameEnd } from './state-game-end.js';

export function stateGamePlay(world, race, boat, HUD) {
  return function GamePlayHandler(eventType, eventObject) {
    if (eventType == EVENT_RAF) {
      var elapsedTime = eventObject;
      while (elapsedTime > 0) {
        elapsedTime = world.update(elapsedTime);
        race.update();
      }

      renderGame(world, race, boat);
      HUD.render();
    }

    if (eventType == EVENT_ARROW_LEFT_DOWN) {
      boat.turnLeft();
      HUD.highlightTouch(true, false);
    }
    if (eventType == EVENT_ARROW_RIGHT_DOWN) {
      boat.turnRight();
      HUD.highlightTouch(false, true);
    }
    if (eventType == EVENT_ARROW_UP_DOWN || eventType == EVENT_ARROW_DOWN_UP) {
      boat.moveForward();
    }
    if (eventType == EVENT_ARROW_DOWN_DOWN) {
      boat.moveBackwards();
    }
    if (eventType == EVENT_ARROW_LEFT_UP || eventType == EVENT_ARROW_RIGHT_UP) {
      boat.straight();
      HUD.highlightTouch();
    }

    if (eventType == EVENT_RACE_OVER) {
      return new stateGameEnd(world, race, boat, HUD);
    }

    if (eventType == EVENT_ESCAPE || eventType == EVENT_DOCUMENT_HIDDEN) {
      return new stateGamePause(world, race, boat, HUD);
    }
  };
}
