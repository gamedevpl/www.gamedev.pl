import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './components/app';
import { GameProvider } from './context/game-context';
import { initSoundLoader } from './game/sound/sound-loader';

const getInitialAppState = () => {
  const hash = document.location.hash;
  switch (hash) {
    case '#game':
      return 'game';
    case '#effects':
      return 'effects';
    case '#buildings':
      return 'buildings';
    case '#pathfinding':
      return 'pathfinding';
    case '#gord':
      return 'gord';
    default:
      return 'intro';
  }
};

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
