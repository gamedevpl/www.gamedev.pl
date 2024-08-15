import { FunctionComponent } from "preact";

interface InstructionsProps {
  onBack: () => void;
}

export const Instructions: FunctionComponent<InstructionsProps> = ({ onBack }) => {
  return (
    <div className="instructions">
      <h1>How to Play</h1>
      <ul>
        <li>Use arrow keys to move your character</li>
        <li>Avoid obstacles (gray squares with crosses)</li>
        <li>Beware of monsters (red triangles) and don't get caught!</li>
        <li><strong>Warning: If a monster catches you, the game is over!</strong></li>
        <li>New monsters appear every 13 steps, so keep moving</li>
        <li>Reach the goal (green square) to complete the level</li>
        <li>Complete all levels to win the game</li>
      </ul>
      <h2>Tips</h2>
      <ul>
        <li>Plan your route carefully to avoid getting trapped by monsters or obstacles</li>
        <li>Use obstacles to your advantage - they block monsters too!</li>
        <li>Keep an eye on your step count to anticipate new monster spawns</li>
        <li>Try to stay ahead of the monsters and create distance when possible</li>
        <li>Remember, monsters will always try to move towards you, use this to predict their movements</li>
        <li>The game gets harder as you progress, so stay alert and adapt your strategy</li>
      </ul>
      <button onClick={onBack}>Back to Menu</button>
    </div>
  );
};