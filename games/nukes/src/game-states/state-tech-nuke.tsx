import { GameState, GameStateComponent } from './types';

const Intro: GameStateComponent = ({ setGameState }) => {
  return <>map</>;
};

export const GameStateTechNuke: GameState = {
  Component: Intro,
  path: '/tech-map',
};
