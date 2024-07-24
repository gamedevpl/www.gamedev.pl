import { useRef, useState } from 'react';
import { useRafLoop } from 'react-use';

export function TimeControls({ updateWorldTime }: { updateWorldTime: (deltaTime: number) => void }) {
  const [isAutoplay, setAutoplay] = useState(true);
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
    <div className="meta-controls">
      <div>
        <button onClick={() => updateWorldTime(1)}>+1 Second</button>
        <button onClick={() => updateWorldTime(10)}>+10 Seconds</button>
        <button onClick={() => updateWorldTime(60)}>+60 seconds</button>
        <button onClick={() => setAutoplay(!isAutoplay)}>{isAutoplay ? 'Stop autoplay' : 'Start autoplay'}</button>
      </div>
    </div>
  );
}
