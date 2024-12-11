import { GameOverStats } from './game-world/game-world-types';
import styled from 'styled-components';

export function GameOverScreen({ stats, onRestart }: GameOverScreenProps) {
  return (
    <GameOverContainer>
      <GameOverTitle>Game Over!</GameOverTitle>
      <StatsContainer>
        <StatRow>
          <span>Time Survived:</span>
          <span>{formatTime(stats.timeSurvived)}</span>
        </StatRow>
        <StatRow>
          <span>Gifts Collected:</span>
          <span>{stats.giftsCollected}</span>
        </StatRow>
        <StatRow>
          <span>Santas Eliminated:</span>
          <span>{stats.santasEliminated}</span>
        </StatRow>
        <StatRow>
          <span>Final Wave:</span>
          <span>{stats.finalWave}</span>
        </StatRow>
      </StatsContainer>
      <RestartButton onClick={onRestart}>Play Again</RestartButton>
    </GameOverContainer>
  );
}

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
  background: rgba(0, 0, 0, 0.8);
  color: white;
  font-family: 'Arial', sans-serif;
  z-index: 1000;
`;

const GameOverTitle = styled.h1`
  font-size: 48px;
  margin-bottom: 24px;
  color: #ff4444;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
`;

const StatsContainer = styled.div`
  background: rgba(255, 255, 255, 0.1);
  padding: 24px;
  border-radius: 8px;
  margin-bottom: 32px;
  min-width: 300px;
`;

const StatRow = styled.div`
  display: flex;
  justify-content: space-between;
  margin: 8px 0;
  font-size: 18px;
`;

const RestartButton = styled.button`
  background: #4caf50;
  color: white;
  border: none;
  padding: 12px 24px;
  font-size: 20px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background: #45a049;
  }

  &:active {
    transform: translateY(1px);
  }
`;

interface GameOverScreenProps {
  stats: GameOverStats;
  onRestart: () => void;
}

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
