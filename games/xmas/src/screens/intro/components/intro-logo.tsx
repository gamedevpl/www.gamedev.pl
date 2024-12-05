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
  /** Optional CSS class name for custom styling */
  className?: string;
  /** Optional text to display instead of default "XMAS" */
  text?: string;
  /** Optional ARIA label for accessibility */
  ariaLabel?: string;
}

/**
 * IntroLogo component displays the main game title with a glowing animation effect
 * 
 * @example
 * ```tsx
 * <IntroLogo text="XMAS" ariaLabel="Christmas Game Logo" />
 * ```
 */
export const IntroLogo: React.FC<IntroLogoProps> = React.memo(({ 
  className,
  text = "XMAS",
  ariaLabel = "Game Logo"
}) => {
  return (
    <LogoText 
      className={className}
      aria-label={ariaLabel}
      role="heading"
      aria-level={1}
    >
      {text}
    </LogoText>
  );
});

// Set display name for debugging purposes
IntroLogo.displayName = 'IntroLogo';