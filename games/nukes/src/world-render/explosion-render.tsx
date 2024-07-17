import styled from 'styled-components';

import { Explosion } from '../world/world-state-types';

export function ExplosionRender({ explosion, worldTimestamp }: { explosion: Explosion; worldTimestamp: number }) {
  if (explosion.startTimestamp > worldTimestamp || explosion.endTimestamp < worldTimestamp) {
    return null;
  }

  const progress = Math.pow(
    Math.min(
      Math.max(0, (worldTimestamp - explosion.startTimestamp) / (explosion.endTimestamp - explosion.startTimestamp)),
      1,
    ),
    0.15,
  );

  return (
    <ExplosionContainer
      style={
        {
          '--x': explosion.position.x,
          '--y': explosion.position.y,
          '--radius': explosion.radius * progress,
          '--color': `rgb(${255 * progress}, ${255 * (1 - progress)}, 0)`,
        } as React.CSSProperties
      }
    />
  );
}

const ExplosionContainer = styled.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -50%);
  position: absolute;
  width: calc(var(--radius) * 2px);
  height: calc(var(--radius) * 2px);
  border-radius: 50%;
  background: var(--color);

  pointer-events: none;
`;
