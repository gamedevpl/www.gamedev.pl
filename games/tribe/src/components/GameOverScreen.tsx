import React from 'react';
import styled from 'styled-components';
import { useGameContext } from '../context/game-context';

const GameOverContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  text-align: center;
  background-color: #1e1e1e; // Darker background for game over
  color: #e0e0e0;
  padding: 20px;
`;

const Title = styled.h1`
  font-size: 3em;
  color: #ff4136; // Red for emphasis
  margin-bottom: 0.5em;
`;

const InfoText = styled.p`
  font-size: 1.5em;
  margin: 0.5em 0;
`;

const ReturnButton = styled.button`
  margin-top: 2em;
  padding: 1em 2em;
  font-size: 1em;
  color: #ffffff;
  background-color: #0074d9; // Blue button
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.3s ease;

  &:hover {
    background-color: #0056b3;
  }
`;

export const GameOverScreen: React.FC = () => {
  const { setAppState, gameOverDetails } = useGameContext();

  const handleReturnToMenu = () => {
    setAppState('intro');
  };

  return (
    <GameOverContainer>
      <Title>Game Over!</Title>
      <InfoText>Lineage Extinct.</InfoText>
      {gameOverDetails && (
        <>
          <InfoText>Generations Survived: {gameOverDetails.generations}</InfoText>
          <InfoText>Cause of Death: {gameOverDetails.cause}</InfoText>
        </>
      )}
      {!gameOverDetails && <InfoText>Details about the last game are unavailable.</InfoText>}
      <ReturnButton onClick={handleReturnToMenu}>Return to Main Menu</ReturnButton>
    </GameOverContainer>
  );
};
