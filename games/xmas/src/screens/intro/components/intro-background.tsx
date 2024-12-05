import React, { useMemo } from 'react';
import styled from 'styled-components';
import { snowfall, float } from '../utils/animations';
import {
  generateSnowflakes,
  generateStars,
  generateTrees,
  DEFAULT_CONFIG,
  type Snowflake,
  type Star,
  type Tree,
} from '../utils/background-generators';

// Styled Components
const BackgroundContainer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, var(--color-night-sky-start) 0%, var(--color-night-sky-end) 100%);
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

const SnowflakeElement = styled.div<{ delay: number; size: number; left: number }>`
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

const StarElement = styled.div<{ top: number; left: number; size: number }>`
  position: absolute;
  top: ${props => props.top}%;
  left: ${props => props.left}%;
  width: ${props => props.size}px;
  height: ${props => props.size}px;
  background: var(--color-accent);
  clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
  animation: ${float} 3s ease-in-out infinite;
`;

const TreeElement = styled.div<{ scale: number; left: number; bottom: number }>`
  position: absolute;
  left: ${props => props.left}%;
  bottom: ${props => props.bottom}%;
  transform: scale(${props => props.scale});
  width: 0;
  height: 0;
  border-left: 15px solid transparent;
  border-right: 15px solid transparent;
  border-bottom: 30px solid var(--color-primary-darker);

  &:before {
    content: '';
    position: absolute;
    width: 0;
    height: 0;
    border-left: 10px solid transparent;
    border-right: 10px solid transparent;
    border-bottom: 20px solid var(--color-primary-darker);
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

// Memoized sub-components for better performance
const MemoizedSnowflake = React.memo<Snowflake>(({ delay, size, left }) => (
  <SnowflakeElement delay={delay} size={size} left={left} />
));

const MemoizedStar = React.memo<Star>(({ top, left, size }) => (
  <StarElement top={top} left={left} size={size} />
));

const MemoizedTree = React.memo<Tree>(({ scale, left, bottom }) => (
  <TreeElement scale={scale} left={left} bottom={bottom} />
));

// Props interface
interface IntroBackgroundProps {
  config?: typeof DEFAULT_CONFIG;
  className?: string;
}

/**
 * IntroBackground component renders the animated background with snowflakes, stars, and trees
 */
export const IntroBackground: React.FC<IntroBackgroundProps> = React.memo(({ 
  config = DEFAULT_CONFIG,
  className 
}) => {
  // Generate background elements using memoization
  const elements = useMemo(() => ({
    snowflakes: generateSnowflakes(config.snowflakes.count, config.snowflakes),
    stars: generateStars(config.stars.count, config.stars),
    trees: generateTrees(config.trees.count, config.trees),
  }), [config]);

  return (
    <BackgroundContainer className={className}>
      <SnowflakeContainer>
        {elements.snowflakes.map(({ id, ...props }) => (
          <MemoizedSnowflake key={id} id={id} {...props} />
        ))}
      </SnowflakeContainer>

      {elements.stars.map(({ id, ...props }) => (
        <MemoizedStar key={id} id={id} {...props} />
      ))}

      {elements.trees.map(({ id, ...props }) => (
        <MemoizedTree key={id} id={id} {...props} />
      ))}
    </BackgroundContainer>
  );
});

IntroBackground.displayName = 'IntroBackground';