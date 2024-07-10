import { useLocation } from 'react-router';
import { GameState, GameStateComponent } from './types';

const PlayingComponent: GameStateComponent = ({}) => {
  const {
    state: { stateName, gameId },
  } = useLocation();

  return (
    <>
      Playing: {stateName} {gameId}
      Render world
    </>
  );
};

export const GameStatePlaying: GameState = {
  Component: PlayingComponent,
  path: '/playing',
};
