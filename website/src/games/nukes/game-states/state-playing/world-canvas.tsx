import { PointerContextWrapper } from '../../controls/pointer';
import { SelectionContextWrapper } from '../../controls/selection';
import { WorldStateRender } from '../../world-render/world-state-render';
import { WorldState } from '../../world/world-state-types';
import { Infotainment } from '../../controls-render/infotainment';
import { StateControl } from '../../controls-render/state-control';

import { TimeControls } from './time-controls';
import { Viewport } from './viewport';

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
        <Viewport>
          <WorldStateRender state={worldState} />
        </Viewport>
        <TimeControls updateWorldTime={(deltaTime) => updateWorldState(worldState, deltaTime)} />
        <StateControl worldState={worldState} setWorldState={setWorldState} />
        <Infotainment worldState={worldState} />
      </PointerContextWrapper>
    </SelectionContextWrapper>
  );
}
