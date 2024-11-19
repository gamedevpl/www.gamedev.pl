import { RefObject } from 'react';
import { useCustomEvent } from '../../utils/custom-events';
import { GameWorldState } from './game-world/game-world-types';
import { RenderState } from './game-render/render-state';
import { addFireball, updateFireball } from './game-world/game-world-manipulate';
import { CreateFireballEvent, GameEvents, UpdateFireballEvent } from './game-input/input-events';

interface GameControllerProps {
  gameStateRef: RefObject<{
    gameWorldState: GameWorldState;
    renderState: RenderState;
  }>;
}

/**
 * GameController component that handles game events and updates game state
 * This component doesn't render anything visible, it only handles game logic
 */
export function GameController({ gameStateRef }: GameControllerProps) {
  // Handle fireball creation events
  useCustomEvent<CreateFireballEvent>(GameEvents.CREATE_FIREBALL, ({ id, x, y, radius }) => {
    if (!gameStateRef.current) return;

    // Create actual fireball with the provided ID
    addFireball(gameStateRef.current.gameWorldState, x, y, radius, id);
  });

  useCustomEvent<UpdateFireballEvent>(GameEvents.UPDATE_FIREBALL, ({ id, x, y, radius }) => {
    if (!gameStateRef.current) return;

    updateFireball(gameStateRef.current.gameWorldState, id, x, y, radius);
  });

  // Component doesn't render anything visible
  return null;
}