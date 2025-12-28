import { createGlobalStyle } from 'styled-components';

/**
 * Global styles for the Bridge Builder game
 *
 * This defines application-wide styles using styled-components.
 * It includes CSS resets and base styling with pixel art theme.
 */
export const GlobalStyle = createGlobalStyle`
  /* CSS Reset */
  *, *::before, *::after {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    padding: 0;
    font-family: 'Press Start 2P', 'Arial', sans-serif;
    background-color: #0b1220;
    color: #e8f0ff;
    line-height: 1.6;
  }

  /* Additional global styles */
  h1, h2, h3, h4, h5, h6 {
    margin-top: 0;
  }

  button {
    cursor: pointer;
    font-family: inherit;
  }

  /* Prevent overflow issues */
  html, body {
    height: 100%;
    overflow-x: hidden;
  }

  /* Root element for React app */
  #root {
    height: 100%;
  }
`;
