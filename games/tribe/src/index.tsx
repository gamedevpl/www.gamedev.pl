import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './components/app'; // Updated import path
import { GameProvider } from './context/game-context';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <GameProvider initialAppState={document.location.hash === '#game' ? 'game' : 'intro'}>
        {' '}
        {/* Set initial app state to 'intro' */}
        <App />
      </GameProvider>
    </React.StrictMode>,
  );
} else {
  console.error('Failed to find the root element');
}
