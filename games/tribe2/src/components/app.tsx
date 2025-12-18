import React from 'react';
import { useGameContext } from '../context/game-context';
import { IntroScreen } from './intro-screen';
import { GameScreen } from './game-screen';
import { GameOverScreen } from './game-over-screen';
import { EffectsScreen } from './effects-screen';
import { GlobalStyle } from '../styles/global';
import { usePersistState } from '../hooks/persist-state';

export const App: React.FC = () => {
  const { appState, setAppState } = useGameContext();

  usePersistState(appState, setAppState);

  const renderContent = () => {
    switch (appState) {
      case 'intro':
        return <IntroScreen />;
      case 'game':
        return <GameScreen />;
      case 'effects':
        return <EffectsScreen />;
      case 'gameOver':
        return (
          <>
            <GameScreen />
            <GameOverScreen />
          </>
        );
      default:
        return <IntroScreen />; // Fallback to intro screen
    }
  };

  return (
    <>
      <GlobalStyle />
      {renderContent()}
    </>
  );
};
