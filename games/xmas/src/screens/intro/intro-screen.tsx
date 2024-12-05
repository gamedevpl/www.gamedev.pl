import React from 'react';
import styled from 'styled-components';
import { IntroBackground } from './components/intro-background';
import { IntroLogo } from './components/intro-logo';
import { IntroPlayButton } from './components/intro-play-button';
import { DEFAULT_CONFIG } from './utils/background-generators';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
  position: relative;
  overflow: hidden;
`;

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  z-index: var(--z-content);
`;

interface IntroScreenProps {
  /** Callback function when play button is clicked */
  onPlayClick: () => void;
  /** Optional background configuration */
  backgroundConfig?: typeof DEFAULT_CONFIG;
}

/**
 * IntroScreen component that serves as the main entry point of the game
 * Combines background, logo, and play button components
 * 
 * @example
 * ```tsx
 * <IntroScreen onPlayClick={() => startGame()} />
 * ```
 */
export const IntroScreen: React.FC<IntroScreenProps> = React.memo(({ 
  onPlayClick,
  backgroundConfig = DEFAULT_CONFIG
}) => {
  return (
    <Container>
      <IntroBackground config={backgroundConfig} />
      <Content>
        <IntroLogo 
          text="XMAS"
          ariaLabel="Christmas Game Logo"
        />
        <IntroPlayButton 
          onClick={onPlayClick}
          ariaLabel="Start the game"
        >
          Play
        </IntroPlayButton>
      </Content>
    </Container>
  );
});

// Set display name for debugging purposes
IntroScreen.displayName = 'IntroScreen';