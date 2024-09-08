import * as PIXI from 'pixi.js';
import { GameState, WarriorState } from '../game-state/game-state-types';

export const SCREEN_WIDTH = 800;
export const SCREEN_HEIGHT = 600;

// Add color constants
const GROUND_COLOR = 0x3a5f0b; // Dark green for the ground
const WARRIOR_COLOR = 0xff0000; // Red for the warrior

let gameContainer: PIXI.Container;
let arena: PIXI.Container;
let warriors: PIXI.Container[];

export function initializeRenderer(app: PIXI.Application) {
  gameContainer = new PIXI.Container();
  app.stage.addChild(gameContainer);

  arena = createArena();
  gameContainer.addChild(arena);

  warriors = [];
}

export function renderGameState(app: PIXI.Application, gameState: GameState) {
  if (!gameContainer) {
    initializeRenderer(app);
  }

  // Update warriors
  gameState.warriors.forEach((warriorState, index) => {
    if (!warriors[index]) {
      warriors[index] = createWarrior();
      gameContainer.addChild(warriors[index]);
    }
    updateWarrior(warriors[index], warriorState);
  });

  // Render the scene
  app.renderer.render(app.stage);
}

function createArena(): PIXI.Container {
  const arenaContainer = new PIXI.Container();

  // Render ground
  const ground = new PIXI.Graphics();
  ground.beginFill(GROUND_COLOR);
  ground.drawRect(0, SCREEN_HEIGHT - 50, SCREEN_WIDTH, 50);
  ground.endFill();
  arenaContainer.addChild(ground);

  return arenaContainer;
}

function createWarrior(): PIXI.Container {
  const warrior = new PIXI.Container();

  const body = new PIXI.Graphics();
  body.beginFill(WARRIOR_COLOR);
  body.poly([]);
  body.endFill();
  body.name = 'body';
  warrior.addChild(body);

  return warrior;
}

function updateWarrior(warriorContainer: PIXI.Container, warriorState: WarriorState) {
  warriorContainer.removeChildAt(0);

  const body = new PIXI.Graphics();
  body.beginFill(WARRIOR_COLOR);
  body.poly(warriorState.vertices.flatMap(({ x, y }) => [x, y]));
  body.endFill();
  body.name = 'body';
  warriorContainer.addChild(body);
}

// Function to clean up renderer resources
export function cleanupRenderer() {
  if (gameContainer) {
    gameContainer.destroy({ children: true });
  }
}
