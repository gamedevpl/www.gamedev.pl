import { useState } from 'react';
import { GameState, GameStateComponent } from './types';
import { GameStatePlaying } from './state-playing/state-playing';
import { getRandomStateNames } from '../content/state-names';

const PlayComponent: GameStateComponent = ({ setGameState }) => {
  const [stateName, setStateName] = useState(getRandomStateNames(1)[0]);

  const handlePlay = () => {
    setGameState(GameStatePlaying, { stateName });
  };

  return (
    <>
      <div>
        <input
          type="text"
          placeholder="Name your state"
          value={stateName}
          onChange={(event) => setStateName(event.currentTarget.value)}
        />
      </div>

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
