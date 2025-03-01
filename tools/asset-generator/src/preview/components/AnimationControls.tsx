/**
 * AnimationControls Component
 *
 * A component for controlling animation playback.
 * Includes play/pause button and speed adjustment slider.
 */

import React from 'react';
import styled from 'styled-components';

interface AnimationControlsProps {
  /** Whether animation is currently playing */
  isPlaying: boolean;
  /** Current animation speed */
  speed: number;
  /** Callback for toggling play/pause */
  onTogglePlay: () => void;
  /** Callback for changing animation speed */
  onSpeedChange: (speed: number) => void;
  /** Optional CSS class name */
  className?: string;
  /** Whether the controls are disabled */
  disabled?: boolean;
}

/**
 * AnimationControls Component
 */
const AnimationControls: React.FC<AnimationControlsProps> = ({
  isPlaying,
  speed,
  onTogglePlay,
  onSpeedChange,
  className,
  disabled = false,
}) => {
  // Handle speed change
  const handleSpeedChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onSpeedChange(parseFloat(event.target.value));
  };

  return (
    <Container className={className}>
      <SectionTitle>Animation Controls</SectionTitle>

      <ControlsRow>
        <PlayButton onClick={onTogglePlay} disabled={disabled} title={isPlaying ? 'Pause animation' : 'Play animation'}>
          {isPlaying ? '❚❚' : '▶'}
        </PlayButton>

        <SpeedControl>
          <Label htmlFor="speed-control">Speed: {speed.toFixed(1)}x</Label>
          <Slider
            id="speed-control"
            type="range"
            min="0.1"
            max="3"
            step="0.1"
            value={speed}
            onChange={handleSpeedChange}
            disabled={disabled}
          />
        </SpeedControl>
      </ControlsRow>
    </Container>
  );
};

// Styled Components
const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1rem;
  background-color: var(--background-color);
  border-radius: var(--border-radius);
  border: 1px solid var(--border-color);
  margin-top: 1rem;
`;

const SectionTitle = styled.h3`
  font-size: 1rem;
  margin: 0;
  color: var(--text-color);
`;

const ControlsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const PlayButton = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: var(--primary-color);
  color: white;
  border: none;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.2s ease-in-out;

  &:hover:not(:disabled) {
    background-color: var(--primary-hover-color, #0056b3);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const SpeedControl = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 0.3rem;
`;

const Label = styled.label`
  font-size: 0.85rem;
  color: var(--text-color);
`;

const Slider = styled.input`
  -webkit-appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--border-color);
  outline: none;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--primary-color);
    cursor: pointer;
  }

  &::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--primary-color);
    cursor: pointer;
    border: none;
  }

  &:disabled {
    opacity: 0.6;
  }
`;

export default AnimationControls;
