import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './components/app';
import { GameProvider, AppState } from './context/game-context';
import { initSoundLoader } from './game/sound/sound-loader';

// Determine initial app state based on URL hash
function getInitialAppState(): AppState {
  const hash = document.location.hash;
  switch (hash) {
    case '#game':
      return 'game';
    case '#editor':
      return 'editor';
    default:
      return 'intro';
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  initSoundLoader().then(() => {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <GameProvider initialAppState={getInitialAppState()}>
          <App />
        </GameProvider>
      </React.StrictMode>,
    );
  });
} else {
  console.error('Failed to find the root element');
}
