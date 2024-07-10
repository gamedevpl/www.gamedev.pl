import { useState } from 'react';
import { GameState, GameStateComponent } from './types';
import { GameStatePlaying } from './state-playing/state-playing';

const PlayComponent: GameStateComponent = ({ setGameState }) => {
  const [stateName, setStateName] = useState('');

  const handlePlay = () => {
    setGameState(GameStatePlaying, { stateName, gameId: String(Date.now()) });
  };

  return (
    <>
      <input
        type="text"
        placeholder="Name your state"
        value={stateName}
        onChange={(event) => setStateName(event.currentTarget.value)}
      />

      <button onClick={handlePlay} disabled={!stateName}>
        Play
      </button>
    </>
  );
};

export const GameStatePlay: GameState = {
  Component: PlayComponent,
  path: '/play',
};
