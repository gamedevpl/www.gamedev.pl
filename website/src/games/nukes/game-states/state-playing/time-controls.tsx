import { useRef, useState } from 'react';
import { useRafLoop } from 'react-use';
import styled from 'styled-components';

export function TimeControls({ updateWorldTime }: { updateWorldTime: (deltaTime: number) => void }) {
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

  return (
    <TimeControlsContainer>
      <button onClick={() => updateWorldTime(1)}>+1 Second</button>
      <button onClick={() => updateWorldTime(10)}>+10 Seconds</button>
      <button onClick={() => updateWorldTime(60)}>+60 seconds</button>
      <button onClick={() => setAutoplay(!isAutoplay)}>{isAutoplay ? 'Stop autoplay' : 'Start autoplay'}</button>
    </TimeControlsContainer>
  );
}

const TimeControlsContainer = styled.div`
  position: absolute;
  right: 0;
  bottom: 0;
  flex-grow: 0;

  border: 1px solid rgb(0, 255, 0);
  padding: 5px 10px;

  text-align: left;
  color: white;
  z-index: 1;
`;
