import React, { useEffect } from 'react';
import { handleKeyDown } from '../game/input/input-handler';
import { GameWorldState } from '../game/types/world-types';
import { MAX_ZOOM, MIN_ZOOM, ZOOM_SPEED } from '../game/constants/rendering-constants';

interface GameInputControllerProps {
  isActive: () => boolean;
  gameStateRef: React.MutableRefObject<GameWorldState>;
}

/**
 * A non-rendering component that handles global keyboard input for the game.
 */
export const GameInputController: React.FC<GameInputControllerProps> = ({
  isActive,
  gameStateRef,
}) => {
  // Keyboard input handler
  useEffect(() => {
    const handleKeyDownEvent = (event: KeyboardEvent) => {
      // Only process input if the game loop is active and the game is not over.
      if (!isActive() || gameStateRef.current.gameOver) {
        return;
      }

      const key = event.key.toLowerCase();

      // Prevent default browser actions for keys we handle (e.g., spacebar scrolling).
      if (key === ' ' || key === 'p') {
        event.preventDefault();
      }

      // Delegate to the generic input handler.
      // The handler may mutate the gameState directly.
      handleKeyDown(key, gameStateRef.current);
    };

    window.addEventListener('keydown', handleKeyDownEvent);

    return () => {
      window.removeEventListener('keydown', handleKeyDownEvent);
    };
  }, [isActive, gameStateRef]);

  // Mouse wheel handler for zooming
  useEffect(() => {
    const handleMouseWheel = (event: WheelEvent) => {
      if (!isActive()) {
        return;
      }
      // Prevent the default scroll behavior, like scrolling the page.
      event.preventDefault();

      const zoomDirection = event.deltaY < 0 ? 1 : -1; // Zoom in for scroll up, out for scroll down
      const zoomAmount = ZOOM_SPEED;

      const currentZoom = gameStateRef.current.viewportZoom;
      let newZoom = currentZoom + zoomDirection * zoomAmount;

      // Clamp the zoom level to the defined min/max values.
      newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));

      // Mutate the game state directly. The rendering loop will pick up the change.
      gameStateRef.current.viewportZoom = newZoom;
    };

    // Add the event listener with `passive: false` to allow `preventDefault`.
    window.addEventListener('wheel', handleMouseWheel, { passive: false });

    return () => {
      window.removeEventListener('wheel', handleMouseWheel);
    };
  }, [isActive, gameStateRef]);

  // This component does not render anything itself.
  return null;
};
