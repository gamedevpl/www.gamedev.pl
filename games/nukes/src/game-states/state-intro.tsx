import { GameState, GameStateComponent } from './types';
import GameStateMapTechDemo from './state-techdemo-map';
import GameStateNukeTechDemo from './state-techdemo-nuke';

const Intro: GameStateComponent = ({ setGameState }) => {
  return (
    <>
      intro
      <button onClick={() => setGameState(GameStateMapTechDemo)}>Map tech demo</button>
      <button onClick={() => setGameState(GameStateNukeTechDemo)}>Nuke tech demo</button>
    </>
  );
};

const GameStateIntro: GameState = {
  Component: Intro,
};

export default GameStateIntro;
