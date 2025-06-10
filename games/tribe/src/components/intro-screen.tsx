import React from 'react';
import styled from 'styled-components';
import { useGameContext } from '../context/game-context';

const IntroContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background-color: #000;
  text-align: center;
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

  return (
    <IntroContainer>
      <Title>Welcome to Tribe!</Title>
      <StartButton onClick={() => setAppState('game')}>Start Game</StartButton>
    </IntroContainer>
  );
};
