import { useEffect } from 'react';
import { WorldState } from '../../world/world-state-types';

// A component which controls whether the game should end
export function GameOverController({ worldState, onGameOver }: { worldState: WorldState; onGameOver: () => void }) {
  useEffect(() => {
    if (worldState.timestamp > 60) {
      onGameOver();
    }
  }, [worldState]);

  return null;
}
