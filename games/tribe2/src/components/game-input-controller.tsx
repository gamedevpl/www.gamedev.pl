import React, { useEffect } from 'react';
import { handleKeyDown } from '../game/input/input-handler';
import { GameWorldState } from '../game/types/game-types';

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
  }, [isActive, gameStateRef]); // Re-bind if these refs change, though they shouldn't.

  // This component does not render anything itself.
  return null;
};
