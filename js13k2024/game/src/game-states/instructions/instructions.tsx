import { FunctionComponent, useEffect } from 'react';

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
        <li>
          Collect bonuses for special abilities:
          <ul>
            <li>Cap of Invisibility: Temporary invisibility to monsters</li>
            <li>Confused Monsters: Monsters move randomly</li>
            <li>Land Mine: Place a trap for monsters</li>
            <li>Time Bomb: Delayed explosion</li>
            <li>Crusher: Destroy nearby obstacles</li>
            <li>Builder: Create new platforms</li>
            <li>Climber: Climb on walls and obstacles</li>
            <li>Teleport: Instantly move to another location on the grid</li>
            <li>Tsunami: Water floods the grid, slowing movement. Climb to survive!</li>
            <li>Monster: Transform into a monster and hunt other monsters</li>
            <li>Slide: Glide across the grid until hitting an obstacle</li>
            <li>Sokoban: Push obstacles to crush monsters or create paths</li>
            <li>Blaster: Shoot in the direction you're moving to eliminate monsters</li>
          </ul>
        </li>
        <li>Complete all 13 levels to win</li>
      </ul>
      <h2>New Bonus Details</h2>
      <ul>
        <li>Tsunami: 
          <ul>
            <li>Water gradually floods the grid over 13 steps</li>
            <li>Movement becomes slower for both you and monsters</li>
            <li>At the 13th step, everything not on an obstacle is eliminated</li>
            <li>Use the Climber bonus to survive on obstacles</li>
          </ul>
        </li>
        <li>Monster: 
          <ul>
            <li>You become a monster for 13 steps</li>
            <li>Monsters become vulnerable "players" during this time</li>
            <li>Eliminate all monster-players to win, but be careful not to let them reach the goal!</li>
          </ul>
        </li>
        <li>Slide: 
          <ul>
            <li>Your movement becomes a slide in the chosen direction</li>
            <li>You'll keep moving until you hit an obstacle or the edge of the grid</li>
            <li>Use this to quickly traverse the grid, but plan your moves carefully!</li>
          </ul>
        </li>
        <li>Sokoban: 
          <ul>
            <li>Gain the ability to push obstacles</li>
            <li>Use this to create new paths or crush monsters</li>
            <li>Strategic obstacle placement can help block monster paths</li>
          </ul>
        </li>
        <li>Blaster: 
          <ul>
            <li>Equip a blaster that shoots in the direction you're moving</li>
            <li>Eliminate monsters in your path</li>
            <li>Use carefully to clear your way to the goal</li>
          </ul>
        </li>
      </ul>
      <h2>Tips</h2>
      <ul>
        <li>Plan your route to avoid getting trapped</li>
        <li>Use obstacles and new bonuses strategically to outmaneuver monsters</li>
        <li>Combine bonuses for powerful effects (e.g., Climber during Tsunami)</li>
        <li>Think ahead when using Slide or Sokoban to avoid putting yourself in danger</li>
        <li>Keep track of your steps to anticipate new monster spawns</li>
      </ul>
      <button onClick={onBack}>Back to Menu</button>
      <p className="instructions-tip">Press Escape to return to the main menu</p>
    </div>
  );
};