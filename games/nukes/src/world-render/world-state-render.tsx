import React from 'react';
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
      <BulkRender items={state.states} Component={StateRender} propertyName="state" />
      <BulkRender items={state.cities} Component={CityRender} propertyName="city" />
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

// simple bulk render component for rendering an array of items with static content
const BulkRender = React.memo(
  ({ items, Component, propertyName }: { items: any[]; propertyName: string; Component: React.FC<any> }) => (
    <>
      {items.map((item) => (
        <Component key={item.id} {...{ [propertyName]: item }} />
      ))}
    </>
  ),
);

const WorldStateContainer = styled.div`
  display: flex;
  flex-grow: 1;

  background: black;
`;
