import styled from 'styled-components';

import { Missile } from '../world/world-state-types';

export function MissileRender({ missile, worldTimestamp }: { missile: Missile; worldTimestamp: number }) {
  if (missile.launchTimestamp > worldTimestamp || missile.targetTimestamp < worldTimestamp) {
    return null;
  }

  const progress = Math.min(
    Math.max(0, (worldTimestamp - missile.launchTimestamp) / (missile.targetTimestamp - missile.launchTimestamp)),
    1,
  );

  const x = missile.launch.x + (missile.target.x - missile.launch.x) * progress;
  const y = missile.launch.y + (missile.target.y - missile.launch.y) * progress;

  return (
    <MissileContainer
      style={
        {
          '--x': x,
          '--y': y,
        } as React.CSSProperties
      }
    />
  );
}

const MissileContainer = styled.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px));
  position: absolute;
  width: 1px;
  height: 1px;
  background: rgb(0, 255, 0);
`;
