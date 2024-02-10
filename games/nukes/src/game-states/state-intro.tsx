import { GameState, GameStateComponent } from './types';
import { GameStateTechMap } from './state-tech-map';
import { GameStateTechNuke } from './state-tech-nuke';
import { GameStateTechWorld } from './state-tech-world';

const Intro: GameStateComponent = ({ setGameState }) => {
  return (
    <>
      <h3>intro</h3>
      <button onClick={() => setGameState(GameStateTechMap)}>Map tech demo</button>
      <br />
      <button onClick={() => setGameState(GameStateTechNuke)}>Nuke tech demo</button>
      <br />
      <button onClick={() => setGameState(GameStateTechWorld)}>Nuke world demo</button>
    </>
  );
};

export const GameStateIntro: GameState = {
  Component: Intro,
  path: '/',
};
