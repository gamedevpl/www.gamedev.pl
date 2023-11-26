import { GameState, GameStateComponent } from './types';

const NukeTechDemo: GameStateComponent = () => {
  return <>nuke</>;
};

const GameStateNukeTechDemo: GameState = {
  Component: NukeTechDemo,
};

export default GameStateNukeTechDemo;
