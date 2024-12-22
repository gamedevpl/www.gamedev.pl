import React from 'react';
import styled from 'styled-components';
import { DEFAULT_CONFIG } from '../utils/background-generators';

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

// Props interface
interface IntroBackgroundProps {
  config?: typeof DEFAULT_CONFIG;
  className?: string;
}

/**
 * IntroBackground component renders the animated background with snowflakes, stars, and trees
 */
export const IntroBackground: React.FC<IntroBackgroundProps> = React.memo(({ className }) => {
  return <BackgroundContainer className={className}></BackgroundContainer>;
});

IntroBackground.displayName = 'IntroBackground';
