import { keyframes } from 'styled-components';

/**
 * Animation for falling snow effect
 * @returns Keyframe animation for snowfall
 */
export const snowfall = keyframes`
  0% {
    transform: translateY(-100vh) translateX(0);
  }
  100% {
    transform: translateY(100vh) translateX(20px);
  }
`;

/**
 * Animation for glowing text effect
 * @returns Keyframe animation for text glow
 */
export const titleGlow = keyframes`
  0%, 100% {
    text-shadow: 0 0 10px #fff, 0 0 20px #fff, 0 0 30px #ff0000, 0 0 40px #ff0000;
  }
  50% {
    text-shadow: 0 0 15px #fff, 0 0 25px #fff, 0 0 35px #ff0000, 0 0 45px #ff0000;
  }
`;

/**
 * Animation for floating effect
 * Used by stars and other elements that need a gentle floating motion
 * @returns Keyframe animation for floating motion
 */
export const float = keyframes`
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
`;