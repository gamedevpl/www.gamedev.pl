import React from 'react';
import styled from 'styled-components';
import { State, City, LaunchSite, Sector, Position } from '../world/world-state-types';

interface StateRenderProps {
  state: State;
  cities: City[];
  launchSites: LaunchSite[];
  sectors: Sector[];
}

export function StateRender({ state, sectors }: StateRenderProps) {
  const centerPosition = React.useMemo(() => {
    const stateSectors = sectors.filter((sector) => sector.stateId === state.id);
    return calculateStateCenter(stateSectors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <StateTitle
        style={{
          transform: `translate(${centerPosition.x}px, ${centerPosition.y}px) translate(-50%, -50%)`,
          color: state.color,
        }}
      >
        {state.name}
      </StateTitle>
    </>
  );
}

const StateTitle = styled.div`
  position: absolute;
  color: white;
  text-shadow: 2px 2px 0px white;
  pointer-events: none;
  font-size: x-large;
`;

function calculateStateCenter(sectors: Sector[]): Position {
  if (sectors.length === 0) {
    return { x: 0, y: 0 };
  }

  const sum = sectors.reduce(
    (acc, sector) => ({
      x: acc.x + (sector.rect.left + sector.rect.right) / 2,
      y: acc.y + (sector.rect.top + sector.rect.bottom) / 2,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: sum.x / sectors.length,
    y: sum.y / sectors.length,
  };
}
