import styled from 'styled-components';

import { City, State, StateId, WorldState } from '../world/world-state-types';
import { getValueInTime } from '../world/world-state-time-utils';
import { usePointer } from '../controls/pointer';

export function Infotainment({ worldState }: { worldState: WorldState }) {
  const pointer = usePointer();

  const cityPopulation: Record<StateId, Array<[City, number]>> = Object.fromEntries(
    worldState.states.map((state) => [
      state.id,
      worldState.cities
        .filter((city) => city.stateId === state.id)
        .map((city) => [city, getValueInTime(city.populationHistogram, worldState.timestamp).population]),
    ]),
  );

  const statePopulation: Array<[State, number]> = worldState.states.map((state) => [
    state,
    cityPopulation[state.id].reduce((r, [, population]) => r + population, 0),
  ]);

  const worldPopulation = worldState.cities.reduce(
    (r, city) => r + getValueInTime(city.populationHistogram, worldState.timestamp).population,
    0,
  );

  return (
    <InfotainmentContainer>
      <ul>
        <li>Time: {worldState.timestamp.toFixed(2)}</li>
        <li>Pointing object: {pointer.pointingObjects.length}</li>
        <li>World population: {worldPopulation}</li>
        <li>Population: </li>
        <ul>
          {statePopulation.map(([state, population]) => (
            <li key={state.id}>
              {state.name}: {population}
              <ul>
                {cityPopulation[state.id].map(([city, population]) => (
                  <li key={city.id}>
                    {city.name}: {population}
                  </li>
                ))}
              </ul>
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

  width: 250px;
  min-width: 200px;
  min-height: 200px;
  overflow-y: auto;

  padding: 10px;

  color: white;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid rgb(0, 255, 0);

  li {
    text-align: left;
  }
`;
