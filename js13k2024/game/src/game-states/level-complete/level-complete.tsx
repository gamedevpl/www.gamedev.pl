import { FunctionComponent } from "preact";

interface LevelCompleteProps {
  level: number;
  onNextLevel: () => void;
  onQuit: () => void;
}

export const LevelComplete: FunctionComponent<LevelCompleteProps> = ({ level, onNextLevel, onQuit }) => {
  return (
    <div className="level-complete">
      <h1>Level {level} Complete!</h1>
      <p>Congratulations! You've completed the level.</p>
      <button onClick={onNextLevel}>Next Level</button>
      <button onClick={onQuit}>Quit</button>
    </div>
  );
};