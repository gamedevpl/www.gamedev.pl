import styled from 'styled-components';

import { Explosion } from '../world/world-state-types';

export function ExplosionRender({ explosion, worldTimestamp }: { explosion: Explosion; worldTimestamp: number }) {
  if (explosion.startTimestamp > worldTimestamp || explosion.endTimestamp < worldTimestamp) {
    return null;
  }

  const progress = Math.min(
    Math.max(0, (worldTimestamp - explosion.startTimestamp) / (explosion.endTimestamp - explosion.startTimestamp)),
    1,
  );

  return (
    <ExplosionContainer
      style={
        {
          '--x': explosion.position.x,
          '--y': explosion.position.y,
          '--radius': explosion.radius * progress,
        } as React.CSSProperties
      }
    />
  );
}

const ExplosionContainer = styled.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -50%);
  position: absolute;
  width: calc(var(--radius) * 1px);
  height: calc(var(--radius) * 1px);
  border-radius: 50%;
  background: rgb(255, 255, 255);
`;
