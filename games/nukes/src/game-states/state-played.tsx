import { useLocation } from 'react-router';
import { GameState, GameStateComponent } from './types';
import { GameResult } from './state-playing/game-over-controller';

const PlayedComponent: GameStateComponent = ({}) => {
  const {
    state: { result },
  } = useLocation() as { state: { result: GameResult } };

  return (
    <>
      Game over, results:
      <pre>{JSON.stringify(result, null, 2)}</pre>
    </>
  );
};

export const GameStatePlayed: GameState = {
  Component: PlayedComponent,
  path: '/played',
};
