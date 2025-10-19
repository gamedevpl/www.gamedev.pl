import React, { useState } from 'react';
import { useGameContext } from '../context/game-context';
import { GameWorldController } from './game-world-controller';

// Styles for the UI overlay, which will be passed as a child to the controller.
const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'white',
  textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
  zIndex: 10, // Ensure UI is on top of the canvas layers
};

const titleStyle: React.CSSProperties = {
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

export const IntroScreen: React.FC = () => {
  const { setAppState } = useGameContext();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <GameWorldController mode="intro">
      <div style={overlayStyle}>
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
    </GameWorldController>
  );
};
