import React from 'react';
import styled from 'styled-components';
import { useGameContext } from '../context/game-context';

const GameContainer = styled.div`
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: #2c5234;
`;

const GameContent = styled.div`
  text-align: center;
  color: #fff;
`;

const Title = styled.h2`
  font-family: 'Press Start 2P', cursive;
  font-size: 2rem;
  margin-bottom: 2rem;
  text-shadow: 2px 2px 0px #000;
`;

const BackButton = styled.button`
  font-family: 'Press Start 2P', cursive;
  font-size: 1rem;
  padding: 0.5rem 1rem;
  color: #fff;
  background-color: #333;
  border: 2px solid #fff;
  cursor: pointer;
  margin-top: 1rem;

  &:hover {
    background-color: #555;
  }
`;

export const GameScreen: React.FC = () => {
  const { setAppState } = useGameContext();

  const handleBackToIntro = () => {
    setAppState('intro');
  };

  return (
    <GameContainer>
      <GameContent>
        <Title>Game Screen</Title>
        <p>Game content will be added here</p>
        <BackButton onClick={handleBackToIntro}>Back to Intro</BackButton>
      </GameContent>
    </GameContainer>
  );
};
