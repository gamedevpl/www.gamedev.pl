import * as PIXI from 'pixi.js';
import { GameState } from '../game-state/game-state-types';

let gameContainer: PIXI.Container;

export function renderGameState(app: PIXI.Application, gameState: GameState) {
  if (!gameContainer) {
    gameContainer = new PIXI.Container();
    app.stage.addChild(gameContainer);
  }

  // Clear existing game objects
  gameContainer.removeChildren();

  // Render warriors
  gameState.warriors.forEach((warriorState) => {
    const warrior = new PIXI.Graphics();
    warrior.beginFill(0xffffff); // White color
    warrior.drawRect(
      warriorState.position,
      app.screen.height - warriorState.height, // Position from bottom
      warriorState.width,
      warriorState.height
    );
    warrior.endFill();

    gameContainer.addChild(warrior);
  });

  // Render the scene
  app.renderer.render(app.stage);
}