import { FunctionComponent } from 'preact';

interface HUDProps {
  level: number;
  score: number;
  steps: number;
}

export const HUD: FunctionComponent<HUDProps> = ({ level, score, steps }) => {
  return (
    <div className="hud">
      <div>Level: {level}</div>
      <div>Score: {score}</div>
      <div>Steps: {steps}</div>
    </div>
  );
};
