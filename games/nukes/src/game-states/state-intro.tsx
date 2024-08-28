import styled, { keyframes } from 'styled-components';
import { GameState, GameStateComponent } from './types';
import { GameStatePlay } from './state-play';
import introBackground from '../assets/intro-background.png';
import nukesGameTitle from '../assets/nukes-game-title.png';
import { useEffect, useState } from 'react';

const zoomAnimation = keyframes`
  0% {
    transform: scale(1.5);
  }
  50% {
    transform: scale(1);
  }
  100% {
    transform: scale(1.5);
  }
`;

const flashAnimation = keyframes`
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
`;

const Container = styled.div`
  height: 100vh;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: url(${introBackground});
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    image-rendering: pixelated;
    opacity: 0.5;
    pointer-events: none;
    z-index: 0;
    animation: ${zoomAnimation} 60s ease-in-out infinite;
  }

  img {
    margin-left: -10px;
    margin-top: -20px;
    margin-right: -10px;
  }

  button {
    font-size: 2.5rem;
    padding: 10px 20px;
    background-color: #ff4500;
    color: #ffffff;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: background-color 0.3s ease;
    margin-top: 20px;

    &:hover {
      background-color: #ff6347;
    }
  }
`;

const FlashOverlay = styled.div<{ isFlashing: boolean }>`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: white;
  z-index: 2;
  pointer-events: none;
  opacity: ${(props) => (props.isFlashing ? 1 : 0)};
  animation: ${(props) => (props.isFlashing ? flashAnimation : 'none')} 4.5s forwards;
`;

const GameTitleContainer = styled.div`
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.7);
  padding-bottom: 2em;
  border-radius: 10px;
  text-align: center;
  box-shadow: 0px 0px 5px black;
`;

const GameTitle = styled.img`
  width: 600px;
  height: auto;
  image-rendering: pixelated;
`;

const Intro: GameStateComponent = ({ setGameState }) => {
  const [isFlashing, setIsFlashing] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsFlashing(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Container>
      <FlashOverlay isFlashing={isFlashing} />
      {!isFlashing && (
        <GameTitleContainer>
          <GameTitle src={nukesGameTitle} alt="Nukes game" />
          <button onClick={() => setGameState(GameStatePlay)}>Play</button>
        </GameTitleContainer>
      )}
    </Container>
  );
};

export const GameStateIntro: GameState = {
  Component: Intro,
  path: '',
};
