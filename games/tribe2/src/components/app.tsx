import React from 'react';
import { useGameContext } from '../context/game-context';
import { GameScreen } from './game-screen';

// A simple inline style for the intro container.
const introContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
  backgroundColor: '#1a202c', // A dark background
  color: 'white',
  fontFamily: 'sans-serif',
};

const buttonStyle: React.CSSProperties = {
  fontSize: '1.5rem',
  padding: '1rem 2rem',
  cursor: 'pointer',
};

export const App: React.FC = () => {
  const { appState, setAppState } = useGameContext();

  const renderContent = () => {
    switch (appState) {
      case 'intro':
        return (
          <div style={introContainerStyle}>
            <h1>Tribe 2</h1>
            <button style={buttonStyle} onClick={() => setAppState('game')}>
              Start Game
            </button>
          </div>
        );
      case 'game':
        return <GameScreen />;
      // No 'gameOver' state from Tribe1 for now, keeping it simple.
      default:
        return (
          <div style={introContainerStyle}>
            <h1>Tribe 2</h1>
            <button style={buttonStyle} onClick={() => setAppState('game')}>
              Start Game
            </button>
          </div>
        );
    }
  };

  return <>{renderContent()}</>;
};
