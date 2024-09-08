import { useState } from 'react';
import styled from 'styled-components';
import { IntroScreen } from './components/intro-screen';
import { GameScreen } from './components/game-screen';
import { GameOverScreen } from './components/game-over-screen';

enum Component {
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
  const [component, setComponent] = useState<Component>(() =>
    window.location.hash === '#play' ? Component.PLAYING : Component.INTRO,
  );

  const startGame = () => {
    setComponent(Component.PLAYING);
  };

  const restartGame = () => {
    setComponent(Component.PLAYING);
  };

  return (
    <AppContainer>
      {component === Component.INTRO && <IntroScreen onStart={startGame} />}
      {component === Component.PLAYING && <GameScreen />}
      {component === Component.GAME_OVER && <GameOverScreen onRestart={restartGame} />}
    </AppContainer>
  );
}
