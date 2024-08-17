import { FunctionComponent, useEffect } from "preact/compat";

interface InstructionsProps {
  onBack: () => void;
}

export const Instructions: FunctionComponent<InstructionsProps> = ({ onBack }) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onBack();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onBack]);

  return (
    <div className="instructions">
      <h1>How to Play Monster Steps</h1>
      <ul>
        <li>Use arrow keys, touch controls, or mouse clicks to move your character</li>
        <li>Avoid obstacles and monsters</li>
        <li>Reach the goal (green square) to complete the level</li>
        <li>New monsters appear every 13 steps</li>
        <li>Collect bonuses for special abilities:
          <ul>
            <li>Cap of Invisibility: Temporary invisibility</li>
            <li>Confused Monsters: Monsters move randomly</li>
            <li>Land Mine: Place a trap for monsters</li>
            <li>Time Bomb: Delayed explosion</li>
            <li>Crusher: Destroy nearby obstacles</li>
            <li>Builder: Create new platforms</li>
          </ul>
        </li>
        <li>Complete all 13 levels to win</li>
      </ul>
      <h2>Tips</h2>
      <ul>
        <li>Plan your route to avoid getting trapped</li>
        <li>Use obstacles to block monsters</li>
        <li>Strategically use bonuses to overcome challenges</li>
        <li>Keep moving to stay ahead of monsters</li>
      </ul>
      <button onClick={onBack}>Back to Menu</button>
      <p className="instructions-tip">Press Escape to return to the main menu</p>
    </div>
  );
};