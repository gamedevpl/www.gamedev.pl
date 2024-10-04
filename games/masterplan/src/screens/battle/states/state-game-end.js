import { renderGame } from '../game/game-render.js';
import { EVENT_ESCAPE } from '../events.js';
import { stateIntro } from './state-intro.js';
import { GAME_STATE_END } from '../consts.js';

export function stateGameEnd(world, race, boat, HUD) {
  const CLASS = 'game-end';

  document.body.classList.add(CLASS);

  return function GameEndHandler(eventType, eventObject) {
    renderGame(world, race, boat);
    HUD.render(GAME_STATE_END);

    if (eventType == EVENT_ESCAPE) {
      document.body.classList.remove(CLASS);

      world.destroy();
      HUD.destroy();

      return new stateIntro();
    }
  };
}
