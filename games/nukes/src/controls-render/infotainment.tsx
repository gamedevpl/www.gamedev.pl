import styled from 'styled-components';

import { City, State, WorldState } from '../world/world-state-types';
import { getValueInTime } from '../world/world-state-time-utils';

export function Infotainment({ worldState }: { worldState: WorldState }) {
  const cityPopulation: Array<[City, number]> = worldState.cities.map((city) => [
    city,
    getValueInTime(city.populationHistogram, worldState.timestamp).population,
  ]);

  const statePopulation: Array<[State, number]> = Object.values(
    cityPopulation.reduce(
      (r, [city, population]) => {
        if (!r[city.stateId]) {
          r[city.stateId] = [worldState.states.find((s) => s.id === city.stateId)!, 0];
        }

        r[city.stateId][1] += population;
        return r;
      },
      {} as { [stateId: string]: [State, number] },
    ),
  );

  const worldPopulation = worldState.cities.reduce(
    (r, city) => r + getValueInTime(city.populationHistogram, worldState.timestamp).population,
    0,
  );

  return (
    <InfotainmentContainer>
      <ul>
        <li>World population: {worldPopulation}</li>
        <li>State population: </li>
        <ul>
          {statePopulation.map(([state, population]) => (
            <li key={state.id}>
              {state.name}: {population}
            </li>
          ))}
        </ul>
        <li>City population:</li>
        <ul>
          {cityPopulation.map(([city, population]) => (
            <li key={city.id}>
              {city.name}: {population}
            </li>
          ))}
        </ul>
      </ul>
    </InfotainmentContainer>
  );
}

const InfotainmentContainer = styled.div`
  position: fixed;
  right: 0;
  top: 0;
  z-index: 1;

  max-width: 25%;
  min-width: 200px;
  max-height: 25%;
  min-height: 200px;
  overflow-y: auto;

  padding: 10px;

  color: white;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid green;

  li {
    text-align: left;
  }
`;
