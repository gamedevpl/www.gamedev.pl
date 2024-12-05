import React from 'react';
import styled, { keyframes } from 'styled-components';

const snowfall = keyframes`
  0% {
    transform: translateY(-100vh) translateX(0);
  }
  100% {
    transform: translateY(100vh) translateX(20px);
  }
`;

const titleGlow = keyframes`
  0%, 100% {
    text-shadow: 0 0 10px #fff, 0 0 20px #fff, 0 0 30px #ff0000, 0 0 40px #ff0000;
  }
  50% {
    text-shadow: 0 0 15px #fff, 0 0 25px #fff, 0 0 35px #ff0000, 0 0 45px #ff0000;
  }
`;

const float = keyframes`
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
`;

const IntroContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
  background: linear-gradient(180deg, #0B1026 0%, #1B2949 100%);
  position: relative;
  overflow: hidden;
`;

const SnowflakeContainer = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  pointer-events: none;
`;

const Snowflake = styled.div<{ delay: number; size: number; left: number }>`
  position: absolute;
  width: ${props => props.size}px;
  height: ${props => props.size}px;
  background: white;
  border-radius: 50%;
  top: -10px;
  left: ${props => props.left}%;
  opacity: 0.6;
  animation: ${snowfall} ${props => 5 + props.delay}s linear infinite;
  animation-delay: -${props => props.delay}s;
`;

const PixelTree = styled.div<{ scale: number; left: number; bottom: number }>`
  position: absolute;
  left: ${props => props.left}%;
  bottom: ${props => props.bottom}%;
  transform: scale(${props => props.scale});
  width: 0;
  height: 0;
  border-left: 15px solid transparent;
  border-right: 15px solid transparent;
  border-bottom: 30px solid #0D4B1C;
  &:before {
    content: '';
    position: absolute;
    width: 0;
    height: 0;
    border-left: 10px solid transparent;
    border-right: 10px solid transparent;
    border-bottom: 20px solid #0D4B1C;
    top: -25px;
    left: -10px;
  }
  &:after {
    content: '';
    position: absolute;
    width: 6px;
    height: 8px;
    background: #4A2505;
    bottom: -35px;
    left: -3px;
  }
`;

const Star = styled.div<{ top: number; left: number; size: number }>`
  position: absolute;
  top: ${props => props.top}%;
  left: ${props => props.left}%;
  width: ${props => props.size}px;
  height: ${props => props.size}px;
  background: #FFD700;
  clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
  animation: ${float} 3s ease-in-out infinite;
`;

const Logo = styled.h1`
  font-family: 'Press Start 2P', cursive;
  font-size: 4rem;
  margin-bottom: 2rem;
  text-align: center;
  color: #ffffff;
  animation: ${titleGlow} 2s ease-in-out infinite;
  text-transform: uppercase;
  letter-spacing: 4px;
  z-index: 1;

  @media (max-width: 768px) {
    font-size: 2.5rem;
  }

  @media (max-width: 480px) {
    font-size: 2rem;
  }
`;

const PlayButton = styled.button`
  font-family: 'Press Start 2P', cursive;
  font-size: 1.5rem;
  padding: 1.5rem 3rem;
  background: linear-gradient(180deg, #4CAF50 0%, #45A049 100%);
  color: white;
  border: none;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  z-index: 1;
  border-radius: 4px;
  box-shadow: 0 4px 0 #2E7D32;

  &:hover {
    transform: translateY(-2px);
    background: linear-gradient(180deg, #45A049 0%, #388E3C 100%);
    box-shadow: 0 6px 0 #2E7D32;
  }

  &:active {
    transform: translateY(2px);
    box-shadow: 0 2px 0 #2E7D32;
  }

  &:focus {
    outline: none;
    box-shadow: 0 4px 0 #2E7D32, 0 0 0 2px #ffffff;
  }

  @media (max-width: 768px) {
    font-size: 1.2rem;
    padding: 1.2rem 2.4rem;
  }

  @media (max-width: 480px) {
    font-size: 1rem;
    padding: 1rem 2rem;
  }
`;

interface IntroScreenProps {
  onPlayClick: () => void;
}

export const IntroScreen: React.FC<IntroScreenProps> = ({ onPlayClick }) => {
  // Generate snowflakes with random properties
  const snowflakes = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    delay: Math.random() * 5,
    size: Math.random() * 4 + 2,
    left: Math.random() * 100
  }));

  // Generate trees with different scales and positions
  const trees = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    scale: 0.5 + Math.random() * 1,
    left: (i * 15) + Math.random() * 10,
    bottom: Math.random() * 15
  }));

  // Generate stars with different positions
  const stars = Array.from({ length: 15 }, (_, i) => ({
    id: i,
    top: Math.random() * 40,
    left: Math.random() * 100,
    size: Math.random() * 4 + 2
  }));

  return (
    <IntroContainer>
      <SnowflakeContainer>
        {snowflakes.map(({ id, delay, size, left }) => (
          <Snowflake key={id} delay={delay} size={size} left={left} />
        ))}
      </SnowflakeContainer>
      
      {stars.map(({ id, top, left, size }) => (
        <Star key={id} top={top} left={left} size={size} />
      ))}

      {trees.map(({ id, scale, left, bottom }) => (
        <PixelTree key={id} scale={scale} left={left} bottom={bottom} />
      ))}

      <Logo>XMAS</Logo>
      <PlayButton 
        onClick={onPlayClick} 
        aria-label="Start the game"
        role="button"
        tabIndex={0}
      >
        Play
      </PlayButton>
    </IntroContainer>
  );
};