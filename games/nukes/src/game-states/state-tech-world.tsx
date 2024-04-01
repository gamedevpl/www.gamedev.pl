import { useCallback, useState } from 'react';
import styled from 'styled-components';

import { createWorldState } from '../world/world-state-create';
import { updateWorldState } from '../world/world-state-updates';
import { WorldState } from '../world/world-state-types';

import { WorldStateRender } from '../render/world-state-render';

import { GameState, GameStateComponent } from './types';

const WorldComponent: GameStateComponent = ({ setGameState }) => {
  const [worldState, setWorldState] = useState(() => createWorldState());
  const updateWorld = useCallback(
    (worldState: WorldState, deltaTime: number) => setWorldState(updateWorldState(worldState, deltaTime)),
    [],
  );

  return (
    <StateContainer>
      <div className="meta-controls">
        <div>Timestamp: {worldState.timestamp}</div>
        <div>
          <button onClick={() => updateWorld(worldState, 1)}>+1 Second</button>
          <button onClick={() => updateWorld(worldState, 10)}>+10 Seconds</button>
          <button onClick={() => updateWorld(worldState, 60)}>+60 seconds</button>
        </div>
      </div>
      <WorldStateRender state={worldState} />
    </StateContainer>
  );
};

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
