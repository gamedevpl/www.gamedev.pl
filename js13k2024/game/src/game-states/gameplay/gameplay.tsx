import { FunctionComponent } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import { GameState } from './gameplay-types';
import { drawGameState } from './grid-render';
import { handleKeyPress } from './game-logic';
import { HUD } from './hud';
import { generateLevel } from './level-generator';

interface GameplayProps {
  level: number;
  score: number;
  onGameOver: () => void;
  onLevelComplete: () => void;
  onGameComplete: () => void;
  updateScore: (newScore: number) => void;
  updateSteps: (newSteps: number) => void;
}

const CELL_SIZE = 40;
const MAX_LEVEL = 13;

export const Gameplay: FunctionComponent<GameplayProps> = ({
  level,
  score,
  onGameOver,
  onLevelComplete,
  onGameComplete,
  updateScore,
  updateSteps,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [[gameState, levelConfig, levelStory], setGameState] = useState(() => generateLevel(level));
  const [showStory, setShowStory] = useState(true);

  useEffect(() => {
    if (!gameState || !levelConfig) return;

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = levelConfig.gridSize.width * CELL_SIZE;
      canvas.height = levelConfig.gridSize.height * CELL_SIZE;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawGameState(ctx, gameState, levelConfig.gridSize, CELL_SIZE);
      }
    }
  }, [gameState, levelConfig, showStory]);

  useEffect(() => {
    if (!gameState || !levelConfig) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (showStory) {
        setShowStory(false);
        return;
      }

      const newGameState = handleKeyPress(e, gameState, levelConfig);
      updateGameState(newGameState);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, levelConfig, showStory, onGameOver, onLevelComplete, updateScore, updateSteps]);

  const updateGameState = (newGameState: GameState) => {
    setGameState([newGameState, levelConfig, levelStory]);
    updateScore(newGameState.score);
    updateSteps(newGameState.steps);

    if (newGameState.isLevelComplete) {
      if (level === MAX_LEVEL) {
        onGameComplete();
      } else {
        onLevelComplete();
      }
    }

    if (newGameState.isGameOver) {
      onGameOver();
    }
  };

  if (showStory) {
    return (
      <div className="level-story">
        <h2>Level {level}</h2>
        <p>{levelStory}</p>
        <p>Press any key to start...</p>
      </div>
    );
  }

  return (
    <div className="gameplay">
      <HUD level={level} score={score} steps={gameState?.steps || 0} />
      <canvas ref={canvasRef} style={{ border: '1px solid white' }} />
    </div>
  );
};
