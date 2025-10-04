import React from 'react';
import styled from 'styled-components';
import { useGameContext } from '../context/game-context';

const GameOverContainer = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background-color: rgba(0, 0, 0, 0.75);
  color: #fff;
  padding: 20px;
  z-index: 10;
`;

const Title = styled.h1`
  font-family: 'Press Start 2P', cursive;
  font-size: 4rem;
  color: #ff4136;
  text-shadow: 4px 4px 0px #000;
  margin-bottom: 1.5rem;
`;

const InfoText = styled.p`
  font-family: 'Press Start 2P', cursive;
  font-size: 1.2rem;
  margin: 0.5em 0;
  color: #fff;
  text-shadow: 2px 2px 0px #000;
`;

const ReturnButton = styled.button`
  font-family: 'Press Start 2P', cursive;
  font-size: 1rem;
  padding: 1rem 2rem;
  margin-top: 2em;
  color: #fff;
  background-color: #ff4136;
  border: 2px solid #fff;
  box-shadow: 4px 4px 0px #fff;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  text-transform: uppercase;

  &:hover {
    background-color: #fff;
    color: #ff4136;
    box-shadow: 4px 4px 0px #ff4136;
  }
`;

export const GameOverScreen: React.FC = () => {
  const { setAppState, gameOverDetails } = useGameContext();

  const handleReturnToMenu = () => {
    setAppState('intro');
  };

  return (
    <GameOverContainer>
      <Title>Game Over</Title>
      <InfoText>Your tribe's lineage has ended.</InfoText>
      {gameOverDetails && (
        <>
          <InfoText>Generations Survived: {gameOverDetails.generations}</InfoText>
          <InfoText>Cause of Extinction: {gameOverDetails.cause}</InfoText>
        </>
      )}
      {!gameOverDetails && <InfoText>Game details are unavailable.</InfoText>}
      <ReturnButton onClick={handleReturnToMenu}>Return to Menu</ReturnButton>
    </GameOverContainer>
  );
};
