import React from 'react';
import styled from 'styled-components';

import { City } from '../world/world-state-types';
import { formatPopulation } from '../world/world-state-utils';
import { useObjectPointer } from '../controls/pointer';

export function CityRender({ city }: { city: City }) {
  const [point, unpoint] = useObjectPointer();

  const currentPopulation = city.population;

  if (!currentPopulation) {
    return null;
  }

  const formattedPopulation = formatPopulation(currentPopulation);

  return (
    <CityContainer
      onMouseEnter={() => point(city)}
      onMouseLeave={() => unpoint(city)}
      style={
        {
          '--x': city.position.x,
          '--y': city.position.y,
        } as React.CSSProperties
      }
    >
      <span>{city.name}</span>
      <CityTooltip>{formattedPopulation} population</CityTooltip>
    </CityContainer>
  );
}

const CityContainer = styled.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -100%);
  position: absolute;
  width: calc(var(--size) * 1px);
  height: calc(var(--size) * 1px);
  color: white;

  &:hover > div {
    display: block;
  }
`;

const CityTooltip = styled.div`
  display: none;
  position: absolute;
  background-color: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 5px;
  border-radius: 3px;
  font-size: 12px;
  white-space: nowrap;
  left: 50%;
  transform: translateX(-50%) translateY(0%);
  pointer-events: none;
`;
