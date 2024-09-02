import React from 'react';
import styled from 'styled-components';

interface IntroScreenProps {
  onStart: () => void;
}

const IntroScreenContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background-color: #2c3e50;
  color: #ecf0f1;
  text-align: center;
`;

const Title = styled.h1`
  font-size: 48px;
  margin-bottom: 20px;
  color: #e74c3c;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
`;

const Subtitle = styled.p`
  font-size: 18px;
  margin-bottom: 30px;
`;

const Instructions = styled.div`
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 30px;
  max-width: 80%;
`;

const InstructionsTitle = styled.h2`
  font-size: 24px;
  margin-bottom: 15px;
  color: #3498db;
`;

const InstructionsList = styled.ul`
  list-style-type: none;
  padding: 0;
`;

const InstructionItem = styled.li`
  font-size: 14px;
  margin-bottom: 10px;
`;

const StartButton = styled.button`
  font-family: 'Press Start 2P', cursive;
  font-size: 20px;
  padding: 15px 30px;
  background-color: #e74c3c;
  color: #ecf0f1;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.3s ease;

  &:hover {
    background-color: #c0392b;
  }
`;

export const IntroScreen: React.FC<IntroScreenProps> = ({ onStart }) => {
  return (
    <IntroScreenContainer>
      <Title>Sword2Sword</Title>
      <Subtitle>Welcome to the ultimate sword skirmish game!</Subtitle>
      <Instructions>
        <InstructionsTitle>How to Play:</InstructionsTitle>
        <InstructionsList>
          <InstructionItem>Move: WASD or Arrow Keys</InstructionItem>
          <InstructionItem>Rotate: Q/E or Left/Right Arrow</InstructionItem>
          <InstructionItem>Duck: S or Down Arrow</InstructionItem>
          <InstructionItem>Jump: Spacebar</InstructionItem>
          <InstructionItem>Attack: Left Mouse Button</InstructionItem>
          <InstructionItem>Block: Right Mouse Button</InstructionItem>
        </InstructionsList>
      </Instructions>
      <StartButton onClick={onStart}>Start Game</StartButton>
    </IntroScreenContainer>
  );
};