import { GameState, GameStateComponent } from './types';
import { GameStatePlay } from './state-play';

const Intro: GameStateComponent = ({ setGameState }) => {
  return (
    <>
      <h3>Nukes game</h3>
      <br />
      <button onClick={() => setGameState(GameStatePlay)}>Play</button>
    </>
  );
};

export const GameStateIntro: GameState = {
  Component: Intro,
  path: '/',
};
