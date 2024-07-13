import styled from 'styled-components';

import { GameState, GameStateComponent } from './types';
import { GameStatePlay } from './state-play';

const Container = styled.div`
  height: 100vh;
  width: 100%;

  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;

  h3 {
    font-size: 3rem;
  }
`;

const Intro: GameStateComponent = ({ setGameState }) => {
  return (
    <Container>
      <h3>Nukes game</h3>
      <br />
      <button onClick={() => setGameState(GameStatePlay)}>Play</button>
    </Container>
  );
};

export const GameStateIntro: GameState = {
  Component: Intro,
  path: '/',
};
