import { GameState, GameStateComponent } from './types';
import { GameStateTechWorld } from './state-tech-world';

const Intro: GameStateComponent = ({ setGameState }) => {
  return (
    <>
      <h3>intro</h3>
      <br />
      <button onClick={() => setGameState(GameStateTechWorld)}>Nuke world demo</button>
    </>
  );
};

export const GameStateIntro: GameState = {
  Component: Intro,
  path: '/',
};
