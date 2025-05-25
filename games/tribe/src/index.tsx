import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './components/app'; // Updated import path
import { GameProvider } from './context/game-context';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <GameProvider>
        <App />
      </GameProvider>
    </React.StrictMode>,
  );
} else {
  console.error('Failed to find the root element');
}
