import { GameState, GameStateComponent } from './types';
import { GameStateTechMap } from './state-tech-map';
import { GameStateTechNuke } from './state-tech-nuke';

const Intro: GameStateComponent = ({ setGameState }) => {
  return (
    <>
      intro
      <button onClick={() => setGameState(GameStateTechMap)}>Map tech demo</button>
      <button onClick={() => setGameState(GameStateTechNuke)}>Nuke tech demo</button>
    </>
  );
};

export const GameStateIntro: GameState = {
  Component: Intro,
  path: '/',
};
