import { renderGame } from '../game/game-render.js';
import { EVENT_ESCAPE, EVENT_HASHCHANGE } from '../events.js';
import { stateIntro } from './state-intro.js';

export function stateGameEnd(world, race, boat, HUD) {
  const CLASS = 'game-end';

  document.body.classList.add(CLASS);

  return function GameEndHandler(eventType, eventObject) {
    renderGame(world, race, boat);
    HUD.render(GAME_STATE_END);

    if (eventType == EVENT_ESCAPE || (eventType == EVENT_HASHCHANGE && eventObject == '')) {
      document.body.classList.remove(CLASS);

      world.destroy();
      HUD.destroy();

      return new stateIntro();
    }
  }.State();
}
