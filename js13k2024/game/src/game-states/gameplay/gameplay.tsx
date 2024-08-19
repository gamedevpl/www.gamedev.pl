import { FunctionComponent, useState, useRef, useEffect } from 'react';
import { drawGameState } from './game-render';
import { drawMoveArrows } from './move-arrows-render';
import { doGameUpdate, handleKeyPress, isGameEnding } from './game-logic';
import { getMoveFromClick, getValidMoves } from './move-utils';
import { HUD } from './hud';
import { generateLevel } from './level-generator';
import { GameState } from './gameplay-types';

interface GameplayProps {
  level: number;
  score: number;
  onGameOver: () => void;
  onLevelComplete: () => void;
  onGameComplete: () => void;
  updateScore: (newScore: number) => void;
  updateSteps: (newSteps: number) => void;
}

const MAX_LEVEL = 13;
const ANIMATION_DURATION = 2000; // 2 seconds for ending animations

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

  const updateGameState = (newGameState: GameState) => {
    setGameState([newGameState, levelConfig, levelStory]);
    updateScore(newGameState.score);
    updateSteps(newGameState.steps);
  };

  useEffect(() => {
    if (gameState.gameEndingState !== 'none') {
      setTimeout(() => {
        if (gameState.gameEndingState === 'levelComplete') {
          if (level === MAX_LEVEL) {
            onGameComplete();
          } else {
            onLevelComplete();
          }
        }

        if (gameState.gameEndingState === 'gameOver') {
          onGameOver();
        }
      }, ANIMATION_DURATION);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.gameEndingState]);

  useEffect(() => {
    if (!gameState || !levelConfig) return;

    const canvas = canvasRef.current;
    let animationFrameId: number;
    if (canvas) {
      // Adjust canvas size for isometric view
      const isometricWidth = (levelConfig.gridSize + levelConfig.gridSize) * levelConfig.cellSize;
      const isometricHeight = ((levelConfig.gridSize + levelConfig.gridSize) * levelConfig.cellSize) / 2;
      canvas.width = isometricWidth;
      canvas.height = isometricHeight + 100; // Add extra space for the platform

      const ctx = canvas.getContext('2d');
      if (ctx) {
        const animate = () => {
          // Draw the game state
          drawGameState(ctx, gameState, levelConfig);

          // Draw move arrows only if the game is not ending
          if (!isGameEnding(gameState)) {
            drawMoveArrows(ctx, getValidMoves(gameState, levelConfig), levelConfig.gridSize, levelConfig.cellSize);
          }

          animationFrameId = requestAnimationFrame(animate);
        };
        animate();
      }
    }

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [gameState, levelConfig, showStory]);

  useEffect(() => {
    if (!gameState || !levelConfig) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (showStory) {
        setShowStory(false);
        return;
      }

      if (!isGameEnding(gameState)) {
        const newGameState = handleKeyPress(e, gameState, levelConfig);
        updateGameState(newGameState);
      }
    };

    const handleClick = (e: MouseEvent) => {
      if (showStory) {
        setShowStory(false);
        return;
      }

      if (isGameEnding(gameState)) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const clickedMove = getMoveFromClick(
        (e.clientX - rect.left) * (canvas.width / rect.width) - canvas.width / 2,
        (e.clientY - rect.top) * (canvas.height / rect.height) - 100,
        gameState,
        levelConfig,
      );

      if (clickedMove) {
        updateGameState(doGameUpdate(clickedMove.direction, gameState, levelConfig));
      }
    };

    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, levelConfig, showStory, onGameOver, onLevelComplete, updateScore, updateSteps]);

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
      <HUD level={level} score={score} steps={gameState?.monsterSpawnSteps || 0} />
      <div className="canvas-container">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
};
