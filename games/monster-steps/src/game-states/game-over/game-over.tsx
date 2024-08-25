import { FunctionComponent } from 'react';

interface GameOverProps {
  score: number;
  steps: number;
  onTryAgain: () => void;
  onQuit: () => void;
}

export const GameOver: FunctionComponent<GameOverProps> = ({ score, steps, onTryAgain, onQuit }) => {
  return (
    <div className="game-over">
      <h1>Game Over</h1>
      <p>Your score: {score}</p>
      <p>Steps taken: {steps}</p>
      <button onClick={onTryAgain}>Try Again</button>
      <button onClick={onQuit}>Quit</button>
    </div>
  );
};
