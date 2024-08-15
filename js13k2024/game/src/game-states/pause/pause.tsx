import { FunctionComponent } from "preact";

interface PauseProps {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
}

export const Pause: FunctionComponent<PauseProps> = ({ onResume, onRestart, onQuit }) => {
  return (
    <div className="pause">
      <h1>Game Paused</h1>
      <button onClick={onResume}>Resume</button>
      <button onClick={onRestart}>Restart</button>
      <button onClick={onQuit}>Quit</button>
    </div>
  );
};