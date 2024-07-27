import React from 'react';
import styled from 'styled-components';

import { City } from '../world/world-state-types';
import { useObjectPointer } from '../controls/pointer';

export function CityRender({ city }: { city: City }) {
  const [point, unpoint] = useObjectPointer();

  const currentPopulation = city.populationHistogram[city.populationHistogram.length - 1].population;
  const maxPopulation = Math.max(...city.populationHistogram.map((entry) => entry.population));
  const size = Math.max(5, 10 * (currentPopulation / maxPopulation));

  return (
    <CityContainer
      onMouseEnter={() => point(city)}
      onMouseLeave={() => unpoint(city)}
      style={
        {
          '--x': city.position.x,
          '--y': city.position.y,
          '--size': size,
          '--opacity': currentPopulation > 0 ? 1 : 0.3,
        } as React.CSSProperties
      }
    >
      <CityTooltip>
        {city.name}: {currentPopulation.toLocaleString()} population
      </CityTooltip>
    </CityContainer>
  );
}

const CityContainer = styled.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -50%);
  position: absolute;
  width: calc(var(--size) * 1px);
  height: calc(var(--size) * 1px);
  opacity: var(--opacity);
  background: rgb(0, 0, 255);

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
  transform: translateX(-50%) translateY(-100%);
  pointer-events: none;
`;
