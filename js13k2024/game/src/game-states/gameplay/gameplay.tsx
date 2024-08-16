import { FunctionComponent } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import { GameState, LevelConfig } from './gameplay-types';
import { drawGameState } from './grid-render';
import { initializeGame, handleKeyPress } from './game-logic';
import { HUD } from './hud';

interface GameplayProps {
  level: number;
  score: number;
  onGameOver: () => void;
  onLevelComplete: () => void;
  updateScore: (newScore: number) => void;
  updateSteps: (newSteps: number) => void;
}

const CELL_SIZE = 40;

export const Gameplay: FunctionComponent<GameplayProps> = ({
  level,
  score,
  onGameOver,
  onLevelComplete,
  updateScore,
  updateSteps,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [[gameState, levelConfig], setGameState] = useState<[GameState, LevelConfig]>(initializeGame(1));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = levelConfig.gridSize.width * CELL_SIZE;
      canvas.height = levelConfig.gridSize.height * CELL_SIZE;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawGameState(ctx, gameState, levelConfig.gridSize, CELL_SIZE);
      }
    }
  }, [gameState, levelConfig]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const newGameState = handleKeyPress(e, gameState, levelConfig);
      updateGameState(newGameState);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, levelConfig, onGameOver, onLevelComplete, updateScore, updateSteps]);

  const updateGameState = (newGameState: GameState) => {
    setGameState([newGameState, levelConfig]);
    updateScore(newGameState.score);
    updateSteps(newGameState.steps);

    if (newGameState.isLevelComplete) {
      onLevelComplete();
    }

    if (newGameState.isGameOver) {
      onGameOver();
    }
  };

  return (
    <div className="gameplay">
      <HUD level={level} score={score} steps={gameState.monsterSpawnSteps} />
      <canvas ref={canvasRef} style={{ border: '1px solid white' }} />
    </div>
  );
};
