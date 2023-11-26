import { GameState, GameStateComponent } from './types';

const MapTechDemo: GameStateComponent = () => {
  return <>map</>;
};

const GameStateMapTechDemo: GameState = {
  Component: MapTechDemo,
};

export default GameStateMapTechDemo;
