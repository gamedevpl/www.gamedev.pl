import { describe, it, expect } from 'vitest';
import { createCanvas } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';
import { initGame } from '../index';
import { renderGame } from '../render';
import { GameWorldState } from '../world-types';

describe('Game Rendering', () => {
  it('should render the game world to a canvas and save it', () => {
    // Initialize the game state
    const gameState: GameWorldState = initGame();

    // Create a canvas
    const canvas = createCanvas(1268, 720);
    const ctx = canvas.getContext('2d');

    // Render the game
    renderGame(
      ctx as unknown as CanvasRenderingContext2D, // Cast because node-canvas context is not identical to DOM one
      gameState,
      false, // isDebugOn
      gameState.viewportCenter, // viewportCenter
      [], // playerActionHints
    );

    // Assert that a pixel at (10, 10) has the expected background color
    // The background color is #2c5234, which is RGB(44, 82, 52)
    const imageData = ctx.getImageData(10, 10, 1, 1).data;
    expect(imageData[0]).toBe(44); // R
    expect(imageData[1]).toBe(82); // G
    expect(imageData[2]).toBe(52); // B
    expect(imageData[3]).toBe(255); // A (Opaque)

    // Save the canvas buffer to a file
    const buffer = canvas.toBuffer('image/png');
    const outputPath = path.resolve(
      '/Users/gtanczyk/src/www.gamedev.pl/games/tribe/src/game/render',
      'render-test-output.png',
    );
    fs.writeFileSync(outputPath, new Uint8Array(buffer));

    console.log(`Test render output saved to: ${outputPath}`);
  });
});
