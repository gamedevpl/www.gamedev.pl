import { PointerContextWrapper } from '../../controls/pointer';
import { SelectionContextWrapper } from '../../controls/selection';
import { WorldStateRender } from '../../world-render/world-state-render';
import { WorldState } from '../../world/world-state-types';
import { StateControl } from './state-control';

import { Viewport, ViewportConfiguration } from './viewport';

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
        <Viewport onGetViewportConfiguration={() => getViewportConfiguration(worldState)}>
          <WorldStateRender state={worldState} />
        </Viewport>
        <StateControl worldState={worldState} setWorldState={setWorldState} />
      </PointerContextWrapper>
    </SelectionContextWrapper>
  );
}

function getViewportConfiguration(worldState: WorldState): ViewportConfiguration {
  const playerState = worldState.states.find((state) => state.isPlayerControlled);
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const sectors = playerState
    ? worldState.sectors.filter((sector) => sector.stateId === playerState.id)
    : worldState.sectors;

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  sectors.forEach((sector) => {
    minX = Math.min(minX, sector.rect.left);
    minY = Math.min(minY, sector.rect.top);
    maxX = Math.max(maxX, sector.rect.right);
    maxY = Math.max(maxY, sector.rect.bottom);
  });

  const sectorWidth = maxX - minX + 1;
  const sectorHeight = maxY - minY + 1;

  const zoomX = viewportWidth / sectorWidth;
  const zoomY = viewportHeight / sectorHeight;
  const zoom = Math.min(zoomX, zoomY) * 1; // 90% to add some padding

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  worldState.sectors.forEach((sector) => {
    minX = Math.min(minX, sector.rect.left);
    minY = Math.min(minY, sector.rect.top);
    maxX = Math.max(maxX, sector.rect.right);
    maxY = Math.max(maxY, sector.rect.bottom);
  });

  return {
    initialTranslate: {
      x: viewportWidth / 2 - centerX * zoom,
      y: viewportHeight / 2 - centerY * zoom,
    },
    initialZoom: zoom,
    minX,
    minY,
    maxX,
    maxY,
  };
}
