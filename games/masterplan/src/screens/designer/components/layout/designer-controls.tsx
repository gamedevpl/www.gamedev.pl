import React from 'react';
import styled from 'styled-components';

interface DesignerControlsProps {
  onStartBattle: () => void;
}

export const DesignerControls: React.FC<DesignerControlsProps> = ({ onStartBattle }) => {
  return (
    <ControlsContainer>
      <StartBattleButton onClick={onStartBattle}>Start Battle</StartBattleButton>
    </ControlsContainer>
  );
};

const ControlsContainer = styled.div`
  position: absolute;
  top: 20px;
  right: 20px;
  border-radius: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
  pointer-events: all;
`;

const StartBattleButton = styled.button`
  padding: 8px 16px;
  font-size: 14px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  animation: shake 5s cubic-bezier(0.36, 0.07, 0.19, 0.97) infinite, grow 5s ease-in-out infinite;
  transform-origin: center;

  &:hover {
    background: rgba(0, 0, 0, 0.8);
  }

  @keyframes shake {
    0%,
    92%,
    96% {
      transform: translate(0, 0) scale(1);
    }
    93% {
      transform: translate(-2px, 0) scale(1.02);
    }
    94% {
      transform: translate(2px, 0) scale(1.02);
    }
    95% {
      transform: translate(-2px, 0) scale(1.02);
    }
  }

  @keyframes grow {
    0%,
    92%,
    100% {
      transform: scale(1);
    }
    94% {
      transform: scale(1.03);
    }
  }
`;
