import { createGlobalStyle } from 'styled-components';
import '@fontsource/press-start-2p';

export const GlobalStyles = createGlobalStyle`
:root {
  font-family: 'Press Start 2P', system-ui;
  font-size: 13px;
  line-height: 1.5;
  font-weight: 400;
  color-scheme: light dark;
  color: rgba(255, 255, 255, 0.87);
  background-color: #242424;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  margin: 0;
  padding: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background-color: #242424;
  overscroll-behavior: none;
  background: radial-gradient(ellipse at center, #30c530 0%, #30c530 64%, #138c13 100%);
}
`;
