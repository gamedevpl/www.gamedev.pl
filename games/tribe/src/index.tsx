import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './components/app';
import { GameProvider } from './context/game-context';
import { initSoundLoader } from './game/sound/sound-loader';

const rootElement = document.getElementById('root');
if (rootElement) {
  initSoundLoader().then(() => {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <GameProvider initialAppState={document.location.hash === '#game' ? 'game' : 'intro'}>
          <App />
        </GameProvider>
      </React.StrictMode>,
    );
  });
} else {
  console.error('Failed to find the root element');
}
