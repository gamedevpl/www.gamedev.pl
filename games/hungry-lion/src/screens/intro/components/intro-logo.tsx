import React from 'react';
import styled from 'styled-components';
import { titleGlow } from '../utils/animations';

const LogoText = styled.h1`
  font-family: 'Press Start 2P', cursive;
  font-size: 4rem;
  margin-bottom: 2rem;
  text-align: center;
  color: var(--color-text);
  animation: ${titleGlow} 2s ease-in-out infinite;
  text-transform: uppercase;
  letter-spacing: 4px;
  z-index: var(--z-content);
  user-select: none;

  @media (max-width: var(--breakpoint-tablet)) {
    font-size: 2.5rem;
  }

  @media (max-width: var(--breakpoint-mobile)) {
    font-size: 2rem;
  }
`;

interface IntroLogoProps {
  className?: string;
  text?: string;
  ariaLabel?: string;
}

export const IntroLogo: React.FC<IntroLogoProps> = React.memo(
  ({ className, text = 'Hungry Lion', ariaLabel = 'Game Logo' }) => {
    return (
      <LogoText className={className} aria-label={ariaLabel} role="heading" aria-level={1}>
        {text}
      </LogoText>
    );
  },
);

// Set display name for debugging purposes
IntroLogo.displayName = 'IntroLogo';
