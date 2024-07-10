import { GameState, GameStateComponent } from './types';

const PlayedComponent: GameStateComponent = ({}) => {
  return <>Game over, results</>;
};

export const GameStatePlayed: GameState = {
  Component: PlayedComponent,
  path: '/played',
};
