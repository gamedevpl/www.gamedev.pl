import React from 'react';
import styled from 'styled-components';
import { LaunchSite, LaunchSiteMode } from '../world/world-state-types';
import { useObjectSelection } from '../controls/selection';
import { useObjectPointer } from '../controls/pointer';
import { LAUNCH_COOLDOWN, MODE_CHANGE_DURATION } from '../world/world-state-constants';

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

  const cooldownProgress = isOnCooldown ? (worldTimestamp - launchSite.lastLaunchTimestamp!) / LAUNCH_COOLDOWN : 0;

  const isChangingMode =
    launchSite.modeChangeTimestamp && worldTimestamp < launchSite.modeChangeTimestamp + MODE_CHANGE_DURATION;
  const modeChangeProgress = isChangingMode
    ? (worldTimestamp - launchSite.modeChangeTimestamp!) / MODE_CHANGE_DURATION
    : 0;

  return (
    <LaunchSiteContainer
      onMouseEnter={() => point(launchSite)}
      onMouseLeave={() => unpoint(launchSite)}
      onClick={() => isPlayerControlled && select()}
      style={
        {
          '--x': launchSite.position.x,
          '--y': launchSite.position.y,
          '--cooldown-progress': cooldownProgress,
          '--mode-change-progress': modeChangeProgress,
        } as React.CSSProperties
      }
      data-selected={isSelected}
      data-cooldown={isOnCooldown}
      data-mode={launchSite.mode}
      data-changing-mode={isChangingMode}
    >
      <ModeIndicator>{launchSite.mode === LaunchSiteMode.ATTACK ? 'A' : 'D'}</ModeIndicator>
    </LaunchSiteContainer>
  );
}

const LaunchSiteContainer = styled.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -50%);
  position: absolute;
  width: 10px;
  height: 20px;
  background: rgb(255, 0, 0);
  overflow: hidden;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: bold;
  font-size: 12px;
  color: white;
  transition: background-color 0.3s;

  &[data-selected='true'] {
    box-shadow: 0 0 10px 5px rgb(255, 0, 0);
  }

  &[data-cooldown='true'] {
    background: rgb(255, 165, 0);

    &::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: calc(var(--cooldown-progress) * 100%);
      background: rgb(255, 0, 0);
    }
  }

  &[data-mode='ATTACK'] {
    background: rgb(255, 0, 0);
  }

  &[data-mode='DEFENCE'] {
    background: rgb(0, 0, 255);
  }

  &[data-changing-mode='true'] {
    background: linear-gradient(
      to right,
      rgb(255, 0, 0) 0%,
      rgb(255, 0, 0) calc(var(--mode-change-progress) * 100%),
      rgb(0, 0, 255) calc(var(--mode-change-progress) * 100%),
      rgb(0, 0, 255) 100%
    );
  }
`;

const ModeIndicator = styled.span`
  z-index: 1;
`;
