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

input, button {
  font-family: 'Press Start 2P', system-ui;
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
  background: radial-gradient(ellipse at center, #6B8E23 0%, #6B8E23 64%, #5b791e 100%);

  > #root {
    display: flex;
    flex-grow: 1;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
  }
}
`;
