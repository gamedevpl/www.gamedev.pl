import styled from 'styled-components';

import { Sector } from '../world/world-state-types';
import { useObjectPointer } from '../controls/pointer';

export function SectorRender({ sector }: { sector: Sector }) {
  const [point, unpoint] = useObjectPointer();

  return (
    <SectorContainer
      onMouseEnter={() => point(sector)}
      onMouseLeave={() => unpoint(sector)}
      data-sector-type={sector.type}
      style={
        {
          '--x': sector.rect.left,
          '--y': sector.rect.top,
          '--width': sector.rect.right - sector.rect.left,
          '--height': sector.rect.bottom - sector.rect.top,
        } as React.CSSProperties
      }
    />
  );
}

const SectorContainer = styled.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px));
  position: absolute;
  width: calc(var(--width) * 1px);
  height: calc(var(--height) * 1px);

  &[data-sector-type='GROUND'] {
    background: rgb(93, 42, 0);
  }

  &[data-sector-type='WATER'] {
    background: rgb(0, 34, 93);
  }
`;
