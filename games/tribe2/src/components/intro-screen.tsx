import React from 'react';
import styled from 'styled-components';
import { useGameContext } from '../context/game-context';

const IntroContainer = styled.div`
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: linear-gradient(to bottom, #1a1a2e, #16213e);
`;

const Title = styled.h1`
  font-family: 'Press Start 2P', cursive;
  font-size: 4rem;
  color: #fff;
  text-shadow: 4px 4px 0px #ff0000;
  margin-bottom: 2rem;
`;

const StartButton = styled.button`
  font-family: 'Press Start 2P', cursive;
  font-size: 1.5rem;
  padding: 1rem 2rem;
  color: #fff;
  background-color: #ff0000;
  border: 2px solid #fff;
  box-shadow: 4px 4px 0px #fff;
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover {
    background-color: #fff;
    color: #ff0000;
    box-shadow: 4px 4px 0px #ff0000;
  }
`;

export const IntroScreen: React.FC = () => {
  const { setAppState } = useGameContext();

  const handleStartGame = () => {
    setAppState('game');
  };

  return (
    <IntroContainer>
      <Title>Tribe 2</Title>
      <StartButton onClick={handleStartGame}>Start Game</StartButton>
    </IntroContainer>
  );
};
