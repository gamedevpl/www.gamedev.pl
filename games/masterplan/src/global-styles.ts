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
}

#game-intro, #game-hud, #game-designer {
  width: 800px;
  max-width: 100%;
  background-color: #202020;
  border: 2px solid #000;
  border-radius: 4px;
  padding: 20px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
}

button {
  font-family: 'Press Start 2P', system-ui;
  font-size: 12px;
  padding: 10px 20px;
  cursor: pointer;
  background-color: #008000; /* Green for grass */
  color: #fff;
  border: 2px solid #000;
  border-radius: 4px;
  transition: background-color 0.2s ease-in-out;
}

button:hover {
  background-color: #006400; /* Darker green */
}

h1, h2, h3, p, ol, ul, li {
  color: #fff;
  text-shadow: 1px 1px 2px #000;
}

ol, ul {
  list-style: none;
  padding: 0;
}

li {
  padding: 5px 0;
}
`;
