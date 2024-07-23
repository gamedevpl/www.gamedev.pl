import { useLocation } from 'react-router-dom';
import { GameState, GameStateComponent } from '../types';

import { useWorldStore } from './world-store';
import { WorldCanvas } from './world-canvas';
import { GameOverController } from './game-over-controller';
import { GameStatePlayed } from '../state-played';

const PlayingComponent: GameStateComponent = ({ setGameState }) => {
  const {
    state: { stateName },
  } = useLocation();

  const { worldState, setWorldState, updateWorldState } = useWorldStore(stateName);

  return (
    <>
      {/* UI */}
      <WorldCanvas worldState={worldState} updateWorldState={updateWorldState} setWorldState={setWorldState} />
      {/* Controllers */}
      <GameOverController worldState={worldState} onGameOver={(result) => setGameState(GameStatePlayed, { result })} />
    </>
  );
};

export const GameStatePlaying: GameState = {
  Component: PlayingComponent,
  path: 'playing',
};
