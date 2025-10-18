import React from 'react';
import { useGameContext } from '../context/game-context';
import { GameScreen } from './game-screen';
import { IntroScreen } from './intro-screen';

export const App: React.FC = () => {
  const { appState } = useGameContext();

  const renderContent = () => {
    switch (appState) {
      case 'intro':
        return <IntroScreen />;
      case 'game':
        return <GameScreen />;
      // The default case also returns to the intro screen.
      default:
        return <IntroScreen />;
    }
  };

  return <>{renderContent()}</>;
};
