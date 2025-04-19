import { useRef, useEffect } from 'react';
import styled from 'styled-components';
import { dispatchCustomEvent } from '../../../utils/custom-events';
import { GameEvents, SetActiveActionEvent } from '../game-input/input-events';
import { LionActionType } from '../game-world/entities/entities-types';
// Adjust the import path based on your project structure
import { Lion2d } from '../../../../../../tools/asset-generator/generator-assets/src/lion-2d/lion-2d';

interface ActionBarProps {
  activeAction: LionActionType;
}

type LionStance = 'standing' | 'walking' | 'running' | 'ambushing' | 'eating';

// Helper component to render the Lion sprite in a button
interface LionSpriteIconProps {
  stance: LionStance;
  width: number;
  height: number;
}

function LionSpriteIcon({ stance, width, height }: LionSpriteIconProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      // Clear previous frame
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Scale the context to fit the sprite within the button dimensions
      const scale = Math.min(canvas.width / width, canvas.height / height);
      const renderWidth = width * scale;
      const renderHeight = height * scale;
      const offsetX = (canvas.width - renderWidth) / 2;
      const offsetY = (canvas.height - renderHeight) / 2;

      // Render the lion
      // We use a fixed animation time and facing direction for the icon
      Lion2d.render(ctx, offsetX, offsetY, renderWidth, renderHeight, 0, stance, 'right');
    }
  }, [stance, width, height]);

  // Use canvas intrinsic size for drawing, CSS for display size
  return (
    <canvas
      ref={canvasRef}
      width={width * 2}
      height={height * 2}
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
}

export function ActionBar({ activeAction }: ActionBarProps) {
  const selectAction = (action: LionActionType) => {
    dispatchCustomEvent<SetActiveActionEvent>(GameEvents.SET_ACTIVE_ACTION, { action });
  };

  const getStanceForAction = (action: LionActionType): LionStance => {
    switch (action) {
      case 'walk':
        return 'walking';
      case 'attack':
        return 'running'; // Use 'running' stance for attack icon
      case 'ambush':
        return 'ambushing';
      default:
        return 'standing'; // Fallback
    }
  };

  return (
    <ActionBarContainer>
      <ActionButton active={activeAction === 'walk'} onClick={() => selectAction('walk')}>
        <LionSpriteIcon stance={getStanceForAction('walk')} width={30} height={30} />
        Walk
      </ActionButton>
      <ActionButton active={activeAction === 'attack'} onClick={() => selectAction('attack')}>
        <LionSpriteIcon stance={getStanceForAction('attack')} width={30} height={30} />
        Attack
      </ActionButton>
      <ActionButton active={activeAction === 'ambush'} onClick={() => selectAction('ambush')}>
        <LionSpriteIcon stance={getStanceForAction('ambush')} width={30} height={30} />
        Ambush
      </ActionButton>
    </ActionBarContainer>
  );
}

const ActionBarContainer = styled.div`
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  z-index: 1000;
`;

const ActionButton = styled.button<{ active: boolean }>`
  width: 70px; // Increased width slightly for icon + text
  height: 70px; // Increased height slightly
  background-color: ${(props) => (props.active ? '#4CAF50' : '#808080')};
  border: 2px solid ${(props) => (props.active ? '#FFFFFF' : 'transparent')}; // Add border for active state
  border-radius: 8px;
  color: white;
  font-weight: bold;
  font-size: 0.8em; // Adjust font size if needed
  cursor: pointer;
  transition: background-color 0.3s, border-color 0.3s;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 5px; // Add padding
  box-sizing: border-box;

  &:hover {
    background-color: ${(props) => (props.active ? '#45a049' : '#707070')};
  }

  & > canvas {
    // Style the canvas within the button
    margin-bottom: 4px; // Space between icon and text
  }
`;
