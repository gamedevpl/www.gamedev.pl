import React from 'react';
import styled from 'styled-components';
import { useGameContext } from '../context/game-context';

const IntroContainer = styled.div`
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: linear-gradient(to bottom, #6db7ff 0%, #4c8de0 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

const Title = styled.h1`
  font-family: 'Press Start 2P', cursive;
  font-size: 2.5rem;
  color: #fff;
  text-shadow: 4px 4px 0px #2f3b44;
  margin-bottom: 1rem;
  text-align: center;

  @media (max-width: 600px) {
    font-size: 1.5rem;
  }
`;

const Subtitle = styled.p`
  font-family: 'Press Start 2P', cursive;
  font-size: 0.8rem;
  color: #e8f0ff;
  text-shadow: 2px 2px 0px #2f3b44;
  margin-bottom: 2rem;
  text-align: center;
  max-width: 600px;
  line-height: 1.8;
  padding: 0 1rem;

  @media (max-width: 600px) {
    font-size: 0.6rem;
  }
`;

const MenuButton = styled.button`
  font-family: 'Press Start 2P', cursive;
  font-size: 1.2rem;
  padding: 1rem 2rem;
  color: #fff;
  background-color: #5de38c;
  border: 4px solid #fff;
  box-shadow: 4px 4px 0px #2f3b44;
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover {
    background-color: #fff;
    color: #5de38c;
    box-shadow: 4px 4px 0px #5de38c;
  }

  @media (max-width: 600px) {
    font-size: 0.9rem;
    padding: 0.8rem 1.5rem;
  }
`;

const PixelBridge = styled.div`
  margin-bottom: 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const BridgeRow = styled.div`
  display: flex;
`;

const Pixel = styled.div<{ color: string }>`
  width: 12px;
  height: 12px;
  background-color: ${(props) => props.color};

  @media (max-width: 600px) {
    width: 8px;
    height: 8px;
  }
`;

const Instructions = styled.div`
  position: absolute;
  bottom: 2rem;
  font-family: 'Press Start 2P', cursive;
  font-size: 0.6rem;
  color: #e8f0ff;
  text-shadow: 2px 2px 0px #2f3b44;
  text-align: center;
  max-width: 500px;
  line-height: 1.6;
  padding: 0 1rem;
`;

const AuthorInfo = styled.div`
  position: absolute;
  bottom: 0.5rem;
  font-family: 'Press Start 2P', cursive;
  font-size: 0.5rem;
  color: #e8f0ff;
  text-shadow: 2px 2px 0px #2f3b44;
  a {
    color: #fff;
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
  }
`;

// Simple pixel art bridge graphic
const bridgePixels = [
  '....################....',
  '...##################...',
  '..##..##..##..##..##..',
  '.##....##....##....##.',
  '##......##..##......##',
  '##......######......##',
  '########################',
  '########################',
];

const colorMap: Record<string, string> = {
  '#': '#9aa7b6',
  '.': 'transparent',
};

export const IntroScreen: React.FC = () => {
  const { setAppState } = useGameContext();

  const handlePlay = () => {
    setAppState('game');
  };

  return (
    <IntroContainer>
      <PixelBridge>
        {bridgePixels.map((row, y) => (
          <BridgeRow key={y}>
            {row.split('').map((char, x) => (
              <Pixel key={`${x}-${y}`} color={colorMap[char] || 'transparent'} />
            ))}
          </BridgeRow>
        ))}
      </PixelBridge>
      <Title>Bridge Builder</Title>
      <Subtitle>
        Build a bridge strong enough to survive a train crossing! Manage your budget wisely and choose materials
        carefully.
      </Subtitle>
      <MenuButton onClick={handlePlay}>Start Game</MenuButton>
      <Instructions>
        Click to place nodes • Connect nodes to build beams • Use triangles for strength • Road beams are where wheels
        roll
      </Instructions>
      <AuthorInfo>
        by{' '}
        <a href="https://github.com/gtanczyk" target="_blank" rel="noopener noreferrer">
          gtanczyk
        </a>
      </AuthorInfo>
    </IntroContainer>
  );
};
