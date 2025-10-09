import React, { useState } from 'react';
import { useGameContext } from '../context/game-context';
import { GameScreen } from './game-screen';
import { BACKGROUND_COLOR } from '../game/game-consts';

// A simple inline style for the intro container.
const introContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
  backgroundColor: BACKGROUND_COLOR,
  color: 'white',
};

const titleStyle: React.CSSProperties = {
  fontFamily: "'Press Start 2P', cursive",
  fontSize: '4rem',
  color: 'white',
  textShadow: '2px 2px 0px red, -2px -2px 0px red, 2px -2px 0px red, -2px 2px 0px red',
  marginBottom: '2rem',
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: 'red',
  color: 'white',
  border: '3px solid white',
  fontFamily: "'Press Start 2P', cursive",
  fontSize: '1.5rem',
  padding: '1rem 2rem',
  cursor: 'pointer',
  borderRadius: 0,
  boxShadow: '5px 5px 0px #8B0000',
  transition: 'all 0.1s ease-in-out',
};

const buttonHoverStyle: React.CSSProperties = {
  transform: 'translate(5px, 5px)',
  boxShadow: '0px 0px 0px #8B0000',
};

export const App: React.FC = () => {
  const { appState, setAppState } = useGameContext();
  const [isHovered, setIsHovered] = useState(false);

  const renderContent = () => {
    switch (appState) {
      case 'intro':
        return (
          <div style={introContainerStyle}>
            <h1 style={titleStyle}>Tribe2</h1>
            <button
              style={{ ...buttonStyle, ...(isHovered ? buttonHoverStyle : {}) }}
              onClick={() => setAppState('game')}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            >
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
            <h1 style={titleStyle}>Tribe2</h1>
            <button
              style={{ ...buttonStyle, ...(isHovered ? buttonHoverStyle : {}) }}
              onClick={() => setAppState('game')}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            >
              Start Game
            </button>
          </div>
        );
    }
  };

  return <>{renderContent()}</>;
};
