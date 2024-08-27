import { initGame } from './main';
import { createElement } from './utils/dom';

// Create a container for the game
const gameContainer = createElement('div');
gameContainer.id = 'game-container';

const init = () => {
  document.body.appendChild(gameContainer);

  // Initialize the game
  initGame(gameContainer);
};

if (document.body) {
  init();
} else {
  document.onreadystatechange = () => {
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
      document.onreadystatechange = null;
      init();
    }
  };
}
