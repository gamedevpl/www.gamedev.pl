import styled from 'styled-components';

import { WorldState } from '../world/world-state-types';
import { usePointerMove } from '../controls/pointer';
import { dispatchCustomEvent } from '../events';

import SectorCanvas from './sector-canvas-render';
import { StateRender } from './state-render';
import { CityRender } from './city-render';
import { LaunchSiteRender } from './launch-site-render';
import { MissileRender } from './missile-render';
import { ExplosionRender } from './explosion-render';

export function WorldStateRender({ state }: { state: WorldState }) {
  const pointerMove = usePointerMove();

  return (
    <WorldStateContainer
      onMouseMove={(event) => pointerMove(event.clientX, event.clientY)}
      onClick={() => dispatchCustomEvent('world-click')}
    >
      {/* static content, does not change at all */}
      <SectorCanvas sectors={state.sectors} />
      {state.states.map((state) => (
        <StateRender key={state.id} />
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
      {state.missiles
        .filter((missile) => missile.launchTimestamp < state.timestamp && missile.targetTimestamp > state.timestamp)
        .map((missile) => (
          <MissileRender key={missile.id} missile={missile} worldTimestamp={state.timestamp} />
        ))}
      {state.explosions
        .filter((explosion) => explosion.startTimestamp < state.timestamp && explosion.endTimestamp > state.timestamp)
        .map((explosion) => (
          <ExplosionRender key={explosion.id} explosion={explosion} worldTimestamp={state.timestamp} />
        ))}
    </WorldStateContainer>
  );
}

const WorldStateContainer = styled.div`
  display: flex;
  flex-grow: 1;

  background: black;
`;
