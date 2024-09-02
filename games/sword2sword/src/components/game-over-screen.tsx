import React from 'react';
import styled from 'styled-components';

interface GameOverScreenProps {
  onRestart: () => void;
}

const GameOverContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.8);
  color: #ecf0f1;
  font-family: 'Press Start 2P', cursive;
  text-align: center;
`;

const GameOverTitle = styled.h1`
  font-size: 48px;
  margin-bottom: 20px;
  color: #e74c3c;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
`;

const FinalScore = styled.div`
  font-size: 24px;
  margin-bottom: 30px;
  color: #f1c40f;
`;

const RestartButton = styled.button`
  font-family: 'Press Start 2P', cursive;
  font-size: 20px;
  padding: 15px 30px;
  background-color: #2ecc71;
  color: #ecf0f1;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.3s ease;

  &:hover {
    background-color: #27ae60;
  }
`;

export const GameOverScreen: React.FC<GameOverScreenProps> = ({ onRestart }) => {
  return (
    <GameOverContainer>
      <GameOverTitle>Game Over</GameOverTitle>
      <FinalScore>Final Score: 0</FinalScore>
      <RestartButton onClick={onRestart}>
        Play Again
      </RestartButton>
    </GameOverContainer>
  );
};