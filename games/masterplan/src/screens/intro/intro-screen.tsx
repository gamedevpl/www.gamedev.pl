import React from 'react';
import styled from 'styled-components';

const IntroContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  background-color: #242424;
  color: #ffffff;
  width: 100%;
`;

const Logo = styled.h1`
  font-family: 'Press Start 2P', cursive;
  font-size: 3rem;
  margin-bottom: 2rem;
  text-align: center;
  @media (max-width: 768px) {
    font-size: 2rem;
  }
`;

const PlayButton = styled.button`
  font-family: 'Press Start 2P', cursive;
  font-size: 1.5rem;
  padding: 1rem 2rem;
  background-color: #4caf50;
  color: white;
  border: none;
  cursor: pointer;
  transition: background-color 0.3s ease;
  &:hover {
    background-color: #45a049;
  }
  &:focus {
    outline: 2px solid #ffffff;
  }
`;

interface IntroScreenProps {
  onPlayClick: () => void;
}

export const IntroScreen: React.FC<IntroScreenProps> = ({ onPlayClick }) => {
  return (
    <IntroContainer>
      <Logo>MasterPlan</Logo>
      <PlayButton onClick={onPlayClick} aria-label="Start the game">
        Play
      </PlayButton>
    </IntroContainer>
  );
};
