/**
 * Input Handler - Process keyboard, mouse, and touch input
 */

import { GameState, Vector2D } from '../game-types';
import { playPauseSound, playClickSound } from '../sound/sound-manager';

/**
 * Handle keyboard input
 */
export function handleKeyDown(key: string, state: GameState): GameState {
  const newKeysPressed = new Set(state.keysPressed);
  newKeysPressed.add(key.toLowerCase());

  // Handle pause with spacebar
  if (key === ' ' || key === 'Spacebar') {
    playPauseSound();
    return {
      ...state,
      isPaused: !state.isPaused,
      keysPressed: newKeysPressed,
    };
  }

  // Handle mute with 'M' key
  if (key.toLowerCase() === 'm') {
    playClickSound();
    return {
      ...state,
      isMuted: !state.isMuted,
      keysPressed: newKeysPressed,
    };
  }

  return {
    ...state,
    keysPressed: newKeysPressed,
  };
}

/**
 * Handle key release
 */
export function handleKeyUp(key: string, state: GameState): GameState {
  const newKeysPressed = new Set(state.keysPressed);
  newKeysPressed.delete(key.toLowerCase());

  return {
    ...state,
    keysPressed: newKeysPressed,
  };
}

/**
 * Handle mouse/pointer movement
 */
export function handleMouseMove(screenPos: Vector2D, state: GameState): GameState {
  return {
    ...state,
    mousePosition: screenPos,
  };
}

/**
 * Handle mouse/pointer click
 */
export function handleMouseClick(screenPos: Vector2D, viewportCenter: Vector2D, canvasWidth: number, canvasHeight: number, state: GameState): GameState {
  playClickSound();

  // Convert screen coordinates to world coordinates
  const worldX = screenPos.x - canvasWidth / 2 + viewportCenter.x;
  const worldY = screenPos.y - canvasHeight / 2 + viewportCenter.y;

  console.log(`Clicked at world position: (${worldX.toFixed(0)}, ${worldY.toFixed(0)})`);

  // In a real game, you might select entities, issue commands, etc.
  // For now, we'll just log the position

  return state;
}

/**
 * Update camera/viewport based on keyboard input
 */
export function updateCameraFromInput(state: GameState, deltaTime: number): Vector2D {
  const moveSpeed = 300; // pixels per second
  let { x, y } = state.viewportCenter;

  // Arrow keys or WASD for camera movement
  if (state.keysPressed.has('arrowleft') || state.keysPressed.has('a')) {
    x -= moveSpeed * deltaTime;
  }
  if (state.keysPressed.has('arrowright') || state.keysPressed.has('d')) {
    x += moveSpeed * deltaTime;
  }
  if (state.keysPressed.has('arrowup') || state.keysPressed.has('w')) {
    y -= moveSpeed * deltaTime;
  }
  if (state.keysPressed.has('arrowdown') || state.keysPressed.has('s')) {
    y += moveSpeed * deltaTime;
  }

  // Wrap camera position (toroidal world)
  x = ((x % state.worldWidth) + state.worldWidth) % state.worldWidth;
  y = ((y % state.worldHeight) + state.worldHeight) % state.worldHeight;

  return { x, y };
}
