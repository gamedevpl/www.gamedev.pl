import { useCallback, useState } from 'react';
import styled from 'styled-components';

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
import { TimeControls } from './state-playing/time-controls';

const WorldComponent: GameStateComponent = ({}) => {
  const [worldState, setWorldState] = useState(() => createWorldState({ playerStateName: 'Player state' }));
  const updateWorld = useCallback(
    (worldState: WorldState, deltaTime: number) => setWorldState(updateWorldState(worldState, deltaTime)),
    [],
  );

  return (
    <SelectionContextWrapper>
      <PointerContextWrapper>
        <StateContainer>
          <Command worldState={worldState} setWorldState={setWorldState} />
          <TimeControls updateWorldTime={(deltaTime) => updateWorld(worldState, deltaTime)} />

          <WorldStateRender state={worldState} />

          <LaunchHighlight />
          <Infotainment worldState={worldState} setWorldState={setWorldState} />
        </StateContainer>
      </PointerContextWrapper>
    </SelectionContextWrapper>
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
