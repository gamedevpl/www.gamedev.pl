import { useState } from 'react';
import styled from 'styled-components';
import { IntroScreen } from './components/intro-screen';
import { GameScreen } from './components/game-screen';
import { GameOverScreen } from './components/game-over-screen';

enum GameState {
  INTRO,
  PLAYING,
  GAME_OVER,
}

const AppContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

export function Sword2SwordApp() {
  const [gameState, setGameState] = useState<GameState>(GameState.INTRO);

  const startGame = () => {
    setGameState(GameState.PLAYING);
  };

  const restartGame = () => {
    setGameState(GameState.PLAYING);
  };

  return (
    <AppContainer>
      {gameState === GameState.INTRO && <IntroScreen onStart={startGame} />}
      {gameState === GameState.PLAYING && <GameScreen />}
      {gameState === GameState.GAME_OVER && <GameOverScreen onRestart={restartGame} />}
    </AppContainer>
  );
}
