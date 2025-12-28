import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './components/app';
import { GameProvider } from './context/game-context';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <GameProvider initialAppState="intro">
        <App />
      </GameProvider>
    </React.StrictMode>,
  );
} else {
  console.error('Failed to find the root element');
}
