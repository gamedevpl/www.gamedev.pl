import styled from 'styled-components';

import { City } from '../world/world-state-types';
import { useObjectPointer } from '../controls/pointer';

export function CityRender({ city }: { city: City }) {
  const [point, unpoint] = useObjectPointer();

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
    />
  );
}

const CityContainer = styled.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -50%);
  position: absolute;
  width: 10px;
  height: 10px;
  background: rgb(0, 0, 255);
`;
