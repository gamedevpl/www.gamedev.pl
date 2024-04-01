import styled from 'styled-components';

import { LaunchSite } from '../world/world-state-types';

export function LaunchSiteRender({ launchSite }: { launchSite: LaunchSite }) {
  return (
    <LaunchSiteContainer
      style={
        {
          '--x': launchSite.position.x,
          '--y': launchSite.position.y,
        } as React.CSSProperties
      }
    />
  );
}

const LaunchSiteContainer = styled.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -50%);
  position: absolute;
  width: 5px;
  height: 5px;
  background: rgb(255, 0, 0);
`;
