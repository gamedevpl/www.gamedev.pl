import { FunctionComponent } from "preact";

interface IntroProps {
  onStart: () => void;
  onInstructions: () => void;
}

export const Intro: FunctionComponent<IntroProps> = ({ onStart, onInstructions }) => {
  return (
    <div className="intro">
      <h1>Welcome to the Game</h1>
      <button onClick={onStart}>Start Game</button>
      <button onClick={onInstructions}>Instructions</button>
    </div>
  );
};