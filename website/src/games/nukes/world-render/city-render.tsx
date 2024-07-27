import React from 'react';
import styled from 'styled-components';

import { City } from '../world/world-state-types';
import { useObjectPointer } from '../controls/pointer';

export function CityRender({ city }: { city: City }) {
  const [point, unpoint] = useObjectPointer();

  const currentPopulation = city.populationHistogram[city.populationHistogram.length - 1].population;
  const maxPopulation = Math.max(...city.populationHistogram.map((entry) => entry.population));
  const size = Math.max(5, 10 * (currentPopulation / maxPopulation));

  // @CODEGEN: When hovering over CityContainer, display a tooltip with with city name and current population
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
    />
  );
}

const CityContainer = styled.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -50%);
  position: absolute;
  width: calc(var(--size) * 1px);
  height: calc(var(--size) * 1px);
  opacity: var(--opacity);
  background: rgb(0, 0, 255);
`;
