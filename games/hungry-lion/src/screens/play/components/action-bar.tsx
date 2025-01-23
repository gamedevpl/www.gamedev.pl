import styled from 'styled-components';
import { dispatchCustomEvent } from '../../../utils/custom-events';
import { GameEvents, ToggleActionEvent } from '../game-input/input-events';

interface ActionBarProps {
  actions: {
    walk: { enabled: boolean };
    attack: { enabled: boolean };
    ambush: { enabled: boolean };
  };
}

export function ActionBar({ actions }: ActionBarProps) {
  const toggleAction = (action: 'walk' | 'attack' | 'ambush') => {
    dispatchCustomEvent<ToggleActionEvent>(GameEvents.TOGGLE_ACTION, {
      action,
      enabled: !actions[action].enabled,
    });
  };

  return (
    <ActionBarContainer>
      <ActionButton active={actions.walk.enabled} onClick={() => toggleAction('walk')}>
        Walk
      </ActionButton>
      <ActionButton active={actions.attack.enabled} onClick={() => toggleAction('attack')}>
        Attack
      </ActionButton>
      <ActionButton active={actions.ambush.enabled} onClick={() => toggleAction('ambush')}>
        Ambush
      </ActionButton>
    </ActionBarContainer>
  );
}

const ActionBarContainer = styled.div`
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  z-index: 1000;
`;

const ActionButton = styled.button<{ active: boolean }>`
  width: 60px;
  height: 60px;
  background-color: ${(props) => (props.active ? '#4CAF50' : '#808080')};
  border: none;
  border-radius: 8px;
  color: white;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.3s;

  &:hover {
    background-color: ${(props) => (props.active ? '#45a049' : '#707070')};
  }
`;
