import { keyframes } from 'styled-components';

/**
 * Animation for title text effect
 * Creates a pulsing glow effect using game-themed colors
 */
export const titleGlow = keyframes`
  0%, 100% {
    text-shadow: 0 0 10px #fff, 0 0 20px #fff, 0 0 30px #ff6b00, 0 0 40px #ff6b00;
  }
  50% {
    text-shadow: 0 0 15px #fff, 0 0 25px #fff, 0 0 35px #ff6b00, 0 0 45px #ff6b00;
  }
`;

/**
 * Animation for button hover effect
 * Creates a subtle pulse effect for interactive elements
 */
export const buttonPulse = keyframes`
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
`;

/**
 * Animation for game object hover
 * Creates a floating effect for game objects
 */
export const float = keyframes`
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
`;

/**
 * Animation for fade in effect
 * Useful for smooth transitions
 */
export const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

/**
 * Animation for fade out effect
 */
export const fadeOut = keyframes`
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
`;

/**
 * Animation for element entrance from bottom
 */
export const slideUp = keyframes`
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
`;

/**
 * Animation for element entrance from top
 */
export const slideDown = keyframes`
  from {
    transform: translateY(-20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
`;

/**
 * Animation for scoring points or achievements
 * Creates a bouncing effect with scaling
 */
export const scorePopup = keyframes`
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  50% {
    transform: scale(1.2);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
`;

/**
 * Animation for danger or warning indicators
 * Creates a pulsing red glow effect
 */
export const dangerPulse = keyframes`
  0%, 100% {
    box-shadow: 0 0 5px #ff0000, 0 0 10px #ff0000;
  }
  50% {
    box-shadow: 0 0 10px #ff0000, 0 0 20px #ff0000;
  }
`;