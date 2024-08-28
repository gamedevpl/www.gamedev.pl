import { useRef, useState } from 'react';
import { useRafLoop } from 'react-use';
import styled from 'styled-components';

export function TimeControls({
  updateWorldTime,
  currentWorldTime,
}: {
  updateWorldTime: (deltaTime: number) => void;
  currentWorldTime: number;
}) {
  const [isAutoplay, setAutoplay] = useState(false);
  const timeRef = useRef<number | null>(null);
  useRafLoop((time) => {
    if (!timeRef.current) {
      timeRef.current = time;
      return;
    }

    const deltaTime = time - timeRef.current;
    timeRef.current = time;

    if (deltaTime <= 0) {
      return;
    }

    if (isAutoplay) {
      updateWorldTime(deltaTime / 1000);
    }
  }, true);

  const formatTime = (time: number) => {
    const days = Math.floor(time / 86400);
    const hours = Math.floor((time % 86400) / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    return [
      [days, 'd'],
      [hours, 'h'],
      [minutes, 'm'],
      [seconds, 's'],
    ]
      .filter(([v]) => !!v)
      .map(([v, u]) => String(v) + u)
      .join(' ');
  };

  return (
    <TimeControlsContainer>
      <TimeControlPanel>
        <CurrentTimeDisplay>
          {currentWorldTime > 0 ? 'Current Time: ' : 'Game not started yet'}
          {formatTime(currentWorldTime)}
        </CurrentTimeDisplay>
        <TimeControlButton onClick={() => updateWorldTime(1)}>+1s</TimeControlButton>
        <TimeControlButton onClick={() => updateWorldTime(10)}>+10s</TimeControlButton>
        <TimeControlButton onClick={() => updateWorldTime(60)}>+1m</TimeControlButton>
        <TimeControlButton onClick={() => setAutoplay(!isAutoplay)}>{isAutoplay ? 'Stop' : 'Start'}</TimeControlButton>
      </TimeControlPanel>
    </TimeControlsContainer>
  );
}

const TimeControlsContainer = styled.div`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 0;
  z-index: 10;
  padding: 10px;
`;

const TimeControlPanel = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  background-color: rgba(0, 0, 0, 0.7);
  border: 2px solid #444;
  border-radius: 10px;
  padding: 10px;
`;

const TimeControlButton = styled.button`
  background-color: #2c3e50;
  color: #ecf0f1;
  border: none;
  padding: 8px 12px;
  margin: 5px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.3s;

  &:hover {
    background-color: #34495e;
  }

  &:active {
    background-color: #2980b9;
  }
`;

const CurrentTimeDisplay = styled.div`
  color: #ecf0f1;
  font-size: 16px;
  font-weight: bold;
  margin-right: 15px;
`;
