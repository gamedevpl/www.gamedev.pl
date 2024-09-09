import * as PIXI from 'pixi.js';
import { GameState, WarriorState } from '../game-state/game-state-types';

export const SCREEN_WIDTH = 800;
export const SCREEN_HEIGHT = 600;

// Add color constants
const GROUND_COLOR = 0x3a5f0b; // Dark green for the ground
const WARRIOR_COLOR = 0xff0000; // Red for the warrior
const SWORD_COLOR = 0xc0c0c0; // Silver for the sword

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
  body.name = 'body';
  warrior.addChild(body);

  const sword = new PIXI.Graphics();
  sword.name = 'sword';
  warrior.addChild(sword);

  return warrior;
}

function updateWarrior(warriorContainer: PIXI.Container, warriorState: WarriorState) {
  const body = warriorContainer.getChildByName('body') as PIXI.Graphics;
  const sword = warriorContainer.getChildByName('sword') as PIXI.Graphics;

  // Clear previous drawings
  body.clear();
  sword.clear();

  // Draw new body shape based on vertices
  body.beginFill(WARRIOR_COLOR);
  if (warriorState.vertices.length > 0) {
    body.moveTo(warriorState.vertices[0].x, warriorState.vertices[0].y);
    for (let i = 1; i < warriorState.vertices.length; i++) {
      body.lineTo(warriorState.vertices[i].x, warriorState.vertices[i].y);
    }
    body.closePath();
  } else {
    // Fallback to default rectangle if no vertices
    body.drawRect(-20, -50, 40, 100);
  }
  body.endFill();

  // Draw new sword shape based on vertices
  sword.beginFill(SWORD_COLOR);
  if (warriorState.sword.length > 0) {
    sword.moveTo(warriorState.sword[0].x, warriorState.sword[0].y);
    for (let i = 1; i < warriorState.sword.length; i++) {
      sword.lineTo(warriorState.sword[i].x, warriorState.sword[i].y);
    }
    sword.closePath();
  } else {
    // Fallback to default rectangle if no vertices
    sword.drawRect(0, 0, 20, 20);
  }
  sword.endFill();
}

// Function to clean up renderer resources
export function cleanupRenderer() {
  if (gameContainer) {
    gameContainer.destroy({ children: true });
  }
}
