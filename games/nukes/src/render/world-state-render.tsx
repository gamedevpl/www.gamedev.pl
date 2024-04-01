import styled from 'styled-components';

import { WorldState } from '../world/world-state-types';

import { SectorRender } from './sector-render';
import { StateRender } from './state-render';
import { CityRender } from './city-render';
import { LaunchSiteRender } from './launch-site-render';
import { MissileRender } from './missile-render';
import { ExplosionRender } from './explosion-render';

export function WorldStateRender({ state }: { state: WorldState }) {
  // wrap this into styled components globl css
  return (
    <WorldStateContainer>
      {state.sectors.map((sector) => (
        <SectorRender key={sector.id} sector={sector} />
      ))}
      {state.states.map((state) => (
        <StateRender key={state.id} state={state} />
      ))}
      {state.cities.map((city) => (
        <CityRender key={city.id} city={city} />
      ))}
      {state.launchSites.map((launchSite) => (
        <LaunchSiteRender key={launchSite.id} launchSite={launchSite} />
      ))}
      {state.missiles.map((missile) => (
        <MissileRender key={missile.id} missile={missile} worldTimestamp={state.timestamp} />
      ))}
      {state.explosions.map((explosion) => (
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
