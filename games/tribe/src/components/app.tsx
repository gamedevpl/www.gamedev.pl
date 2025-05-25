import React from 'react';
import { useGameContext } from '../context/game-context';
import { IntroScreen } from './intro-screen';
import { GameScreen } from './game-screen';
import { GlobalStyle } from '../styles/global'; // Assuming GlobalStyle is exported from global.ts

export const App: React.FC = () => {
  const { appState } = useGameContext();

  return (
    <>
      <GlobalStyle />
      {appState === 'intro' ? <IntroScreen /> : <GameScreen />}
    </>
  );
};
