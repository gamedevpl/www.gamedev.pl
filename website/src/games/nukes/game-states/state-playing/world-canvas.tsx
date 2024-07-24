import styled from 'styled-components';
import { Command } from '../../controls/command';
import { PointerContextWrapper } from '../../controls/pointer';
import { SelectionContextWrapper } from '../../controls/selection';
import { WorldStateRender } from '../../world-render/world-state-render';
import { LaunchHighlight } from '../../controls-render/launch-highlight';
import { WorldState } from '../../world/world-state-types';
import { TimeControls } from './time-controls';
import { Infotainment } from '../../controls-render/infotainment';
import { StateControl } from '../../controls-render/state-control';

export function WorldCanvas({
  worldState,
  setWorldState,
  updateWorldState,
}: {
  worldState: WorldState;
  setWorldState: (worldState: WorldState) => void;
  updateWorldState: (worldState: WorldState, deltaTime: number) => void;
}) {
  return (
    <SelectionContextWrapper>
      <PointerContextWrapper>
        <CanvasContainer>
          <Command worldState={worldState} setWorldState={setWorldState} />
          <TimeControls updateWorldTime={(deltaTime) => updateWorldState(worldState, deltaTime)} />
          <StateControl worldState={worldState} setWorldState={setWorldState} />

          <WorldStateRender state={worldState} />

          <LaunchHighlight />
          <Infotainment worldState={worldState} />
        </CanvasContainer>
      </PointerContextWrapper>
    </SelectionContextWrapper>
  );
}

const CanvasContainer = styled.div`
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
