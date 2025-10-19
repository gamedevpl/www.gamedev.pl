import React, { useState } from 'react';
import { initWorld } from '../game/game-factory';
import { GameWorldController } from './game-world-controller';

export const GameScreen: React.FC = () => {
  // The GameScreen is responsible for creating the initial world state when the game starts.
  const [initialState] = useState(() => initWorld());

  // It then passes this state to the unified controller, which handles all rendering and updates.
  return <GameWorldController mode="game" initialState={initialState} />;
};
