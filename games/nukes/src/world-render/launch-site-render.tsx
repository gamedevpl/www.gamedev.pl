import React from "react";
import styled from 'styled-components';
import { LaunchSite } from '../world/world-state-types';
import { useObjectSelection } from '../controls/selection';
import { useObjectPointer } from '../controls/pointer';
import { LAUNCH_COOLDOWN } from '../world/world-state-constants';

export function LaunchSiteRender({
  launchSite,
  worldTimestamp,
  isPlayerControlled,
}: {
  launchSite: LaunchSite;
  worldTimestamp: number;
  isPlayerControlled: boolean;
}) {
  const [isSelected, select] = useObjectSelection(launchSite);
  const [point, unpoint] = useObjectPointer();

  const isOnCooldown =
    launchSite.lastLaunchTimestamp && launchSite.lastLaunchTimestamp + LAUNCH_COOLDOWN > worldTimestamp;

  return (
    <LaunchSiteContainer
      onMouseEnter={() => point(launchSite)}
      onMouseLeave={() => unpoint(launchSite)}
      onClick={() => isPlayerControlled && select()}
      style={{ '--x': launchSite.position.x, '--y': launchSite.position.y } as React.CSSProperties}
      data-selected={isSelected}
      data-cooldown={isOnCooldown}
    ></LaunchSiteContainer>
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

  &[data-cooldown='true'] {
    opacity: 0.5;
    background: rgb(255, 165, 0); /* Change color to indicate cooldown */
  }
`;
