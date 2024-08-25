import { MonsterStepsApp } from './main';
import { createElement } from './utils/dom';

// Create a container for the game
const gameContainer = createElement('div');
gameContainer.id = 'game-container';
document.body.appendChild(gameContainer);

// Initialize the game
const game = new MonsterStepsApp(gameContainer);
game.init();