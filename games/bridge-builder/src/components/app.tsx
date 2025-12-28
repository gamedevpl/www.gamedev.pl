import React from 'react';
import { useGameContext } from '../context/game-context';
import { IntroScreen } from './intro-screen';
import { GameScreen } from './game-screen';
import { GlobalStyle } from '../styles/global';

export const App: React.FC = () => {
  const { appState } = useGameContext();

  const renderContent = () => {
    switch (appState) {
      case 'intro':
        return <IntroScreen />;
      case 'game':
        return <GameScreen />;
      default:
        return <IntroScreen />;
    }
  };

  return (
    <>
      <GlobalStyle />
      {renderContent()}
    </>
  );
};
