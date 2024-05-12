import styled from 'styled-components';
import { EntityType } from '../world/world-state-types';
import { useSelectedObject } from '../controls/selection';
import { usePointer } from '../controls/pointer';

export function LaunchHighlight() {
  const selectedObject = useSelectedObject();
  const pointer = usePointer();

  if (selectedObject?.type !== EntityType.LAUNCH_SITE) {
    return null;
  }

  return (
    <HighlightContainer
      style={
        {
          '--x': pointer.x,
          '--y': pointer.y,
        } as React.CSSProperties
      }
    >
      {pointer.pointingObjects.length > 0 ? 'Launch' : ''}
    </HighlightContainer>
  );
}

const HighlightContainer = styled.div`
  position: absolute;
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px));
  pointer-events: none;
  color: red;
`;
