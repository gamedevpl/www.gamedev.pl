import React from 'react';
import { useGameContext } from '../context/game-context';

export const IntroScreen: React.FC = () => {
  const { setAppState } = useGameContext();

  return (
    <div>
      <h1>Welcome to Tribe!</h1>
      <button onClick={() => setAppState('game')}>Start Game</button>
    </div>
  );
};
