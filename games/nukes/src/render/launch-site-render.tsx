import styled from 'styled-components';

import { LaunchSite } from '../world/world-state-types';
import { useObjectSelection } from '../controls/selection';

export function LaunchSiteRender({ launchSite }: { launchSite: LaunchSite }) {
  const [isSelected, select] = useObjectSelection(launchSite);

  return (
    <LaunchSiteContainer
      onClick={() => select()}
      style={
        {
          '--x': launchSite.position.x,
          '--y': launchSite.position.y,
        } as React.CSSProperties
      }
      data-selected={isSelected}
    />
  );
}

const LaunchSiteContainer = styled.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -50%);
  position: absolute;
  width: 5px;
  height: 5px;
  background: rgb(255, 0, 0);

  cursor: pointer;

  &[data-selected='true'] {
    box-shadow: 0 0 10px 5px rgb(255, 0, 0);
  }
`;
