import { render } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { Intro } from './game-states/intro/intro';
import { Instructions } from './game-states/instructions/instructions';
import { Gameplay } from './game-states/gameplay/gameplay';
import { GameOver } from './game-states/game-over/game-over';
import { LevelComplete } from './game-states/level-complete/level-complete';
import { soundEngine } from './sound/sound-engine';
import './global-styles.css';

enum GameState {
  Intro,
  Instructions,
  Gameplay,
  GameOver,
  LevelComplete,
  GameComplete,
}

function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.Intro);
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [steps, setSteps] = useState(0);

  const startGame = useCallback(() => {
    setGameState(GameState.Gameplay);
  }, []);

  const showInstructions = () => {
    setGameState(GameState.Instructions);
  };

  const restartGame = () => {
    setLevel(1);
    setScore(0);
    setSteps(0);
    setGameState(GameState.Gameplay);
  };

  const restartLevel = () => {
    setGameState(GameState.Gameplay);
  };

  const quitGame = () => {
    setGameState(GameState.Intro);
  };

  const gameOver = () => {
    soundEngine.playGameOver();
    setGameState(GameState.GameOver);
  };

  const levelComplete = () => {
    soundEngine.playLevelComplete();
    setLevel(level + 1);
    setGameState(GameState.LevelComplete);
  };

  const nextLevel = useCallback(() => {
    setGameState(GameState.Gameplay);
  }, []);

  const gameComplete = () => {
    soundEngine.playLevelComplete(); // We can reuse the level complete sound for game completion
    setGameState(GameState.GameComplete);
  };

  const updateScore = (newScore: number) => setScore(newScore);
  const updateSteps = (newSteps: number) => setSteps(newSteps);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        if (gameState === GameState.Intro) {
          startGame();
        } else if (gameState === GameState.LevelComplete) {
          nextLevel();
        } else if (gameState === GameState.GameOver) {
          restartLevel();
        }
      } else if (e.key === 'Escape') {
        if (gameState === GameState.Instructions || gameState === GameState.GameOver) {
          quitGame();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [gameState, startGame, nextLevel]);

  return (
    <div className="game-container">
      {gameState === GameState.Intro && <Intro onStart={startGame} onInstructions={showInstructions} />}
      {gameState === GameState.Instructions && <Instructions onBack={quitGame} />}
      {gameState === GameState.Gameplay && (
        <Gameplay
          level={level}
          score={score}
          onGameOver={gameOver}
          onLevelComplete={levelComplete}
          onGameComplete={gameComplete}
          updateScore={updateScore}
          updateSteps={updateSteps}
        />
      )}
      {gameState === GameState.GameOver && (
        <GameOver score={score} steps={steps} onTryAgain={restartLevel} onQuit={quitGame} />
      )}
      {gameState === GameState.LevelComplete && (
        <LevelComplete level={level} onNextLevel={nextLevel} onQuit={quitGame} />
      )}
      {gameState === GameState.GameComplete && (
        <GameComplete score={score} steps={steps} onPlayAgain={restartGame} onQuit={quitGame} />
      )}
    </div>
  );
}

render(<App />, document.body);

// GameComplete component
interface GameCompleteProps {
  score: number;
  steps: number;
  onPlayAgain: () => void;
  onQuit: () => void;
}

function GameComplete({ score, steps, onPlayAgain, onQuit }: GameCompleteProps) {
  return (
    <div className="game-complete">
      <h1>Congratulations!</h1>
      <p>You've completed all 13 levels!</p>
      <p>Final Score: {score}</p>
      <p>Total Steps: {steps}</p>
      <button onClick={onPlayAgain}>Play Again</button>
      <button onClick={onQuit}>Quit</button>
    </div>
  );
}
