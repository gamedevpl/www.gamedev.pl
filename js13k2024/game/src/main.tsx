import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { Intro } from './game-states/intro/intro';
import { Instructions } from './game-states/instructions/instructions';
import { Gameplay } from './game-states/gameplay/gameplay';
import { Pause } from './game-states/pause/pause';
import { GameOver } from './game-states/game-over/game-over';
import { LevelComplete } from './game-states/level-complete/level-complete';
import './global-styles.css';

enum GameState {
  Intro,
  Instructions,
  Gameplay,
  Pause,
  GameOver,
  LevelComplete,
  GameComplete,
}

function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.Intro);
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [steps, setSteps] = useState(0);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && gameState === GameState.Intro) {
        startGame();
      }
      if (e.key === 'Escape' && gameState === GameState.Gameplay) {
        setGameState(GameState.Pause);
      }
      if (e.key === 'ArrowRight' && gameState === GameState.LevelComplete) {
        nextLevel();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gameState]);

  const startGame = () => setGameState(GameState.Gameplay);
  const showInstructions = () => setGameState(GameState.Instructions);
  const resumeGame = () => setGameState(GameState.Gameplay);
  const restartGame = () => {
    setLevel(1);
    setScore(0);
    setSteps(0);
    setGameState(GameState.Gameplay);
  };
  const quitGame = () => setGameState(GameState.Intro);
  const gameOver = () => setGameState(GameState.GameOver);
  const levelComplete = () => {
    setLevel(level + 1);
    setGameState(GameState.LevelComplete);
  };
  const nextLevel = () => setGameState(GameState.Gameplay);
  const gameComplete = () => setGameState(GameState.GameComplete);

  const updateScore = (newScore: number) => setScore(newScore);
  const updateSteps = (newSteps: number) => setSteps(newSteps);

  return (
    <div className="game-container">
      {gameState === GameState.Intro && <Intro onStart={startGame} onInstructions={showInstructions} />}
      {gameState === GameState.Instructions && <Instructions onBack={() => setGameState(GameState.Intro)} />}
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
      {gameState === GameState.Pause && <Pause onResume={resumeGame} onRestart={restartGame} onQuit={quitGame} />}
      {gameState === GameState.GameOver && (
        <GameOver score={score} steps={steps} onTryAgain={restartGame} onQuit={quitGame} />
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
