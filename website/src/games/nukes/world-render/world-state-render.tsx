import React, { useRef } from 'react';
import styled from 'styled-components';

import { WorldState } from '../world/world-state-types';
import { usePointerMove } from '../controls/pointer';
import { dispatchCustomEvent } from '../events';

import SectorCanvas from './sector-canvas-render';
import { StateRender } from './state-render';
import { CityRender } from './city-render';
import { LaunchSiteRender } from './launch-site-render';
import { EffectsCanvas } from './effects-canvas';
import { UnitCanvas } from './unit-render';

export function WorldStateRender({ state }: { state: WorldState }) {
  const pointerMove = usePointerMove();
  const worldStateRef = useRef<WorldState>(state);

  // Update the ref when the state changes
  React.useEffect(() => {
    worldStateRef.current = state;
  }, [state]);

  return (
    <WorldStateContainer
      onMouseMove={(event) => pointerMove(event.clientX, event.clientY)}
      onClick={() => dispatchCustomEvent('world-click')}
    >
      {/* static content, does not change at all */}
      <SectorCanvas sectors={state.sectors} states={state.states} />
      {state.states.map((stateItem) => (
        <StateRender
          key={stateItem.id}
          state={stateItem}
          cities={state.cities}
          launchSites={state.launchSites}
          sectors={state.sectors}
        />
      ))}
      {state.cities.map((city) => (
        <CityRender key={city.id} city={city} />
      ))}
      {state.launchSites.map((launchSite) => (
        <LaunchSiteRender
          key={launchSite.id}
          launchSite={launchSite}
          worldTimestamp={state.timestamp}
          isPlayerControlled={launchSite.stateId === state.states.find((state) => state.isPlayerControlled)?.id}
        />
      ))}

      {/* dynamic content, changes with time */}
      <EffectsCanvas state={state} />

      {/* New UnitCanvas component for rendering units */}
      <UnitCanvas worldStateRef={worldStateRef} />
    </WorldStateContainer>
  );
}

const WorldStateContainer = styled.div`
  position: absolute;

  background: black;

  > canvas {
    position: absolute;
  }
`;
