import React from 'react';
import styled from 'styled-components';

const Button = styled.button`
  /* Typography */
  font-family: 'Press Start 2P', cursive;
  font-size: 1.5rem;
  text-transform: uppercase;
  
  /* Sizing and Padding */
  padding: 1.5rem 3rem;
  
  /* Colors and Gradients */
  background: linear-gradient(180deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
  color: var(--color-text);
  
  /* Border and Shadow */
  border: none;
  border-radius: 4px;
  box-shadow: 0 4px 0 var(--color-primary-darker);
  
  /* Positioning */
  position: relative;
  z-index: var(--z-content);
  
  /* Interaction */
  cursor: pointer;
  transition: all var(--animation-speed-fast) var(--animation-curve);

  /* Hover State */
  &:hover {
    transform: translateY(-2px);
    background: linear-gradient(180deg, var(--color-primary-dark) 0%, var(--color-primary-darker) 100%);
    box-shadow: 0 6px 0 var(--color-primary-darker);
  }

  /* Active State */
  &:active {
    transform: translateY(2px);
    box-shadow: 0 2px 0 var(--color-primary-darker);
  }

  /* Focus State */
  &:focus {
    outline: none;
    box-shadow: 0 4px 0 var(--color-primary-darker),
                0 0 0 2px var(--color-text);
  }

  /* Focus Visible (keyboard navigation) */
  &:focus-visible {
    outline: 2px solid var(--color-text);
    outline-offset: 4px;
  }

  /* Disabled State */
  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
    background: linear-gradient(180deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
    box-shadow: 0 4px 0 var(--color-primary-darker);
  }

  /* Media Queries for Responsive Design */
  @media (max-width: var(--breakpoint-tablet)) {
    font-size: 1.2rem;
    padding: 1.2rem 2.4rem;
  }

  @media (max-width: var(--breakpoint-mobile)) {
    font-size: 1rem;
    padding: 1rem 2rem;
  }

  /* Reduced Motion */
  @media (prefers-reduced-motion: reduce) {
    transition: none;
    &:hover {
      transform: none;
    }
  }
`;

interface IntroPlayButtonProps {
  /** Click handler for the button */
  onClick: () => void;
  /** Optional CSS class name for styling */
  className?: string;
  /** Button text content */
  children?: React.ReactNode;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Optional ARIA label for accessibility */
  ariaLabel?: string;
  /** Optional custom button type */
  type?: 'button' | 'submit' | 'reset';
}

/**
 * IntroPlayButton component renders a styled button with hover and active states
 * 
 * @example
 * ```tsx
 * <IntroPlayButton 
 *   onClick={() => console.log('Play clicked')}
 *   ariaLabel="Start the game"
 * >
 *   Play
 * </IntroPlayButton>
 * ```
 */
export const IntroPlayButton: React.FC<IntroPlayButtonProps> = React.memo(({
  onClick,
  className,
  children = 'Play',
  disabled = false,
  ariaLabel = 'Start the game',
  type = 'button'
}) => {
  const handleKeyPress = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      onClick();
    }
  };

  return (
    <Button
      onClick={onClick}
      onKeyPress={handleKeyPress}
      className={className}
      disabled={disabled}
      aria-label={ariaLabel}
      type={type}
      role="button"
      tabIndex={0}
    >
      {children}
    </Button>
  );
});

// Set display name for debugging purposes
IntroPlayButton.displayName = 'IntroPlayButton';