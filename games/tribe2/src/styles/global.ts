import { createGlobalStyle } from 'styled-components';

/**
 * Global styles for the Tribe2 game
 * 
 * This defines application-wide styles using styled-components.
 * It includes CSS resets and base styling.
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
    background-color: #121212;
    color: #f0f0f0;
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
