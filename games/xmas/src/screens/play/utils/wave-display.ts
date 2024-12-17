import styled, { keyframes } from 'styled-components';
import { WaveState } from '../game-ai/ai-santa-types';
import { useCallback, useEffect, useRef, useState } from 'react';

// Animation keyframes
const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
`;

const fadeOut = keyframes`
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(1.2);
  }
`;

const pulse = keyframes`
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
  }
`;

// Styled components for wave info
export const WaveInfoContainer = styled.div`
  position: fixed;
  top: 20px;
  left: 20px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  padding: 10px 20px;
  border-radius: 10px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
  animation: ${fadeIn} 0.3s ease-out;
`;

export const WaveNumber = styled.div`
  font-size: 24px;
  font-weight: bold;
  color: #ff4444;
`;

export const EnemyCount = styled.div`
  font-size: 18px;
  color: #ffaa44;
`;

// Styled components for wave splash
export const WaveSplashContainer = styled.div<{ isVisible: boolean }>`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: ${({ isVisible }) => (isVisible ? fadeIn : fadeOut)} 0.5s ease-out;
  pointer-events: none;
`;

export const WaveSplashTitle = styled.div`
  font-size: 48px;
  font-weight: bold;
  color: #ff4444;
  text-shadow: 0 0 10px rgba(255, 68, 68, 0.5);
  margin-bottom: 10px;
  animation: ${pulse} 2s infinite ease-in-out;
`;

export const WaveSplashSubtitle = styled.div`
  font-size: 24px;
  color: #ffffff;
  text-shadow: 0 0 5px rgba(255, 255, 255, 0.5);
`;

// Types for wave display props
export interface WaveInfoProps {
  waveState: WaveState;
  enemyCount: number;
}

export interface WaveSplashProps {
  waveNumber: number;
  isVisible: boolean;
  onAnimationComplete?: () => void;
}

// Helper functions
export const formatWaveNumber = (wave: number): string => {
  return `Wave ${wave}`;
};

export const formatEnemyCount = (count: number): string => {
  return `Enemy Santas: ${count}`;
};

export const getWaveDescription = (waveNumber: number): string => {
  if (waveNumber === 1) {
    return 'The invasion begins!';
  } else if (waveNumber % 5 === 0) {
    return 'Boss wave incoming!';
  } else {
    return 'Prepare for battle!';
  }
};

// Hook for managing wave splash visibility
export const useWaveSplash = (duration: number = 3000) => {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<number>();

  const showWaveSplash = useCallback(() => {
    setIsVisible(true);
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      setIsVisible(false);
    }, duration);
  }, [duration]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    isVisible,
    showWaveSplash,
  };
};
