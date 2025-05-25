import React from 'react';
import { useGameContext } from '../context/game-context';
import { IntroScreen } from './intro-screen';
import { GameScreen } from './game-screen';
import { GlobalStyle } from '../styles/global'; // Assuming GlobalStyle is exported from global.ts
import { usePersistState } from '../hooks/persist-state';

export const App: React.FC = () => {
  const { appState, setAppState } = useGameContext();

  usePersistState(appState, setAppState);

  return (
    <>
      <GlobalStyle />
      {appState === 'intro' ? <IntroScreen /> : <GameScreen />}
    </>
  );
};
