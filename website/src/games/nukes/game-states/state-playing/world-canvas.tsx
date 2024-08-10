import { PointerContextWrapper } from '../../controls/pointer';
import { SelectionContextWrapper } from '../../controls/selection';
import { WorldStateRender } from '../../world-render/world-state-render';
import { WorldState } from '../../world/world-state-types';
import { StateControl } from './state-control';

import { Viewport } from './viewport';

export function WorldCanvas({
  worldState,
  setWorldState,
}: {
  worldState: WorldState;
  setWorldState: (worldState: WorldState) => void;
}) {
  return (
    <SelectionContextWrapper>
      <PointerContextWrapper>
        <Viewport>
          <WorldStateRender state={worldState} />
        </Viewport>
        <StateControl worldState={worldState} setWorldState={setWorldState} />
      </PointerContextWrapper>
    </SelectionContextWrapper>
  );
}
