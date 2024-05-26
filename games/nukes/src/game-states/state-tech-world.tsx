import { useCallback, useRef, useState } from 'react';
import styled from 'styled-components';
import { useRafLoop } from 'react-use';

import { createWorldState } from '../world/world-state-create';
import { updateWorldState } from '../world/world-state-updates';
import { WorldState } from '../world/world-state-types';
import { SelectionContextWrapper } from '../controls/selection';
import { WorldStateRender } from '../world-render/world-state-render';

import { LaunchHighlight } from '../controls-render/launch-highlight';

import { GameState, GameStateComponent } from './types';
import { PointerContextWrapper } from '../controls/pointer';
import { Command } from '../controls/command';
import { Infotainment } from '../controls-render/infotainment';

const WorldComponent: GameStateComponent = ({}) => {
  const [worldState, setWorldState] = useState(() => createWorldState());
  const updateWorld = useCallback(
    (worldState: WorldState, deltaTime: number) => setWorldState(updateWorldState(worldState, deltaTime)),
    [],
  );

  return (
    <SelectionContextWrapper>
      <PointerContextWrapper>
        <StateContainer>
          <Command worldState={worldState} setWorldState={setWorldState} />
          <TimeControls
            worldStateTimestamp={worldState.timestamp}
            updateWorldTime={(deltaTime) => updateWorld(worldState, deltaTime)}
          />

          <WorldStateRender state={worldState} />

          <LaunchHighlight />
          <Infotainment worldState={worldState} />
        </StateContainer>
      </PointerContextWrapper>
    </SelectionContextWrapper>
  );
};

function TimeControls({
  worldStateTimestamp,
  updateWorldTime,
}: {
  worldStateTimestamp: number;
  updateWorldTime: (deltaTime: number) => void;
}) {
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

        <div>Timestamp: {worldStateTimestamp.toFixed(2)}</div>
      </div>
    </div>
  );
}

const StateContainer = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;

  display: flex;
  flex-direction: column;

  background: black;

  .meta-controls {
    display: flex;
    flex-grow: 0;

    border: 1px solid rgb(0, 255, 0);
    padding: 5px 10px;

    text-align: left;
    color: white;
    z-index: 1;
  }
`;

export const GameStateTechWorld: GameState = {
  Component: WorldComponent,
  path: '/tech-world',
};
